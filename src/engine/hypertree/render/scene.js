import {
  GraphRenderError,
  finiteNonNegative,
  finiteNumber,
  finitePositive
} from './errors.js';
import { assertHexColor } from './colors.js';
import {
  GEOMETRY_TOLERANCE,
  MAX_ARC_RADIUS_CSS,
  hyperlineGeometry,
  nodeBoundary
} from './geometry.js';

export const SCENE_LIMITS = Object.freeze({
  maxNodes: 1500,
  maxEdges: 1499
});

export const DEFAULT_PRESENTATION = Object.freeze({
  background: '#0b0e14',
  edgeStroke: '#344054',
  edgeWidth: 1,
  folderFill: '#2f3f56',
  folderStroke: '#7c8ca8',
  fileFill: '#8793a6',
  fileStroke: '#c3ccda',
  rootFill: '#6366f1',
  rootStroke: '#c7d2fe',
  nodeStrokeWidth: 1,
  defaultNodeRadius: 3,
  minNodeRadius: 0.2,
  transformNodes: true,
  maxArcRadiusCss: MAX_ARC_RADIUS_CSS
});

/**
 * Prepare an immutable drawing scene from an accepted staged radial result.
 * All geometry is in normalized coordinates or CSS pixels; the projection is
 * used only for center/CSS conversion.
 *
 * @param {object} staged stageRadialLayout result
 * @param {{
 *   phase?: string,
 *   projection: object,
 *   nodeDims?: Map<string, number>,
 *   nodeKinds?: Map<string, 'folder'|'file'>,
 *   presentation?: object
 * }} options
 */
export function prepareGraphScene(staged, options = {}) {
  if (!staged || !(staged.nodes instanceof Map) || !(staged.children instanceof Map)) {
    throw new GraphRenderError('invalid-scene', 'staged radial result is required');
  }
  const phase = options.phase === undefined ? staged.firstPhase : options.phase;
  if (!staged.phases.includes(phase)) {
    throw new GraphRenderError('invalid-phase', `unsupported scene phase ${JSON.stringify(phase)}`);
  }
  const projection = requireProjection(options.projection);
  const presentation = normalizePresentation(options.presentation);
  const nodeOpacity = normalizeNodeOpacity(options.nodeOpacity);
  const nodeDims = options.nodeDims instanceof Map ? options.nodeDims : null;
  const nodeKinds = options.nodeKinds instanceof Map ? options.nodeKinds : null;
  if (staged.nodes.size > SCENE_LIMITS.maxNodes) {
    throw new GraphRenderError('scene-limit', `node count exceeds ${SCENE_LIMITS.maxNodes}`);
  }

  const nodes = new Map();
  const normalized = new Map();
  for (const [id, record] of staged.nodes) {
    if (typeof id !== 'string') throw new GraphRenderError('invalid-node', 'node id must be a string');
    const position = record.positions && record.positions.get(phase);
    if (!position) throw new GraphRenderError('invalid-node', 'node has no position for selected phase', id);
    const theta = finiteNumber(position.theta, `${id}.theta`);
    const rho = finiteNonNegative(position.rho, `${id}.rho`);
    const x = rho * Math.cos(theta);
    const y = rho * Math.sin(theta);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new GraphRenderError('invalid-node', 'normalized node position is not finite', id);
    }
    const dim = nodeDims && nodeDims.has(id) ? nodeDims.get(id) : presentation.defaultNodeRadius;
    const boundary = nodeBoundary({
      x,
      y,
      dim,
      transform: presentation.transformNodes
    });
    const kind = resolveKind(id, staged.rootId, nodeKinds);
    const center = projection.toCss(x, y);
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
      throw new GraphRenderError('invalid-node', 'projected center is not finite', id);
    }
    const visible = boundary.radius > presentation.minNodeRadius;
    const node = {
      id,
      kind,
      depth: record.depth,
      normalized: { x, y, rho },
      center,
      radius: boundary.radius,
      visible,
      fill: id === staged.rootId ? presentation.rootFill : (kind === 'folder' ? presentation.folderFill : presentation.fileFill),
      stroke: id === staged.rootId ? presentation.rootStroke : (kind === 'folder' ? presentation.folderStroke : presentation.fileStroke),
      shape: kind === 'folder' ? 'circle' : 'diamond'
    };
    if (nodeOpacity) node.opacity = opacityFor(nodeOpacity, id);
    nodes.set(id, node);
    normalized.set(id, { x, y, rho });
  }

  const edges = [];
  let edgeCount = 0;
  for (const [parentId, childIds] of staged.children) {
    if (!nodes.has(parentId)) throw new GraphRenderError('invalid-edge', 'parent has no scene node', parentId);
    for (const childId of childIds) {
      edgeCount += 1;
      if (edgeCount > SCENE_LIMITS.maxEdges) {
        throw new GraphRenderError('scene-limit', `edge count exceeds ${SCENE_LIMITS.maxEdges}`);
      }
      if (!normalized.has(childId)) throw new GraphRenderError('invalid-edge', 'child has no scene node', childId);
      const from = normalized.get(parentId);
      const to = normalized.get(childId);
      const geometry = hyperlineGeometry(from, to, { tolerance: GEOMETRY_TOLERANCE });
      const fromCss = projection.toCss(from.x, from.y);
      const toCss = projection.toCss(to.x, to.y);
      let edge;
      if (geometry.kind === 'line') {
        edge = {
          fromId: parentId,
          toId: childId,
          kind: 'line',
          fallback: geometry.fallback,
          fromCss,
          toCss,
          stroke: presentation.edgeStroke,
          width: presentation.edgeWidth
        };
      } else {
        const centerCss = projection.toCss(geometry.center.x, geometry.center.y);
        const radiusCss = geometry.radius * projection.radius;
        if (!Number.isFinite(radiusCss) || radiusCss <= 0 || radiusCss > presentation.maxArcRadiusCss) {
          edge = {
            fromId: parentId,
            toId: childId,
            kind: 'line',
            fallback: radiusCss > presentation.maxArcRadiusCss ? 'arc-css-radius-limit' : 'invalid-arc',
            fromCss,
            toCss,
            stroke: presentation.edgeStroke,
            width: presentation.edgeWidth
          };
        } else {
          edge = {
            fromId: parentId,
            toId: childId,
            kind: 'arc',
            fallback: null,
            fromCss,
            toCss,
            centerCss,
            radiusCss,
            startAngle: geometry.startAngle,
            endAngle: geometry.endAngle,
            sense: geometry.sense,
            stroke: presentation.edgeStroke,
            width: presentation.edgeWidth
          };
        }
      }
      if (nodeOpacity) edge.opacity = Math.min(nodes.get(parentId).opacity, nodes.get(childId).opacity);
      validateEdge(edge);
      edges.push(edge);
    }
  }

  return {
    phase,
    projection,
    presentation,
    nodes,
    edges,
    nodeCount: nodes.size,
    edgeCount: edges.length,
    limits: SCENE_LIMITS
  };
}

function resolveKind(id, rootId, nodeKinds) {
  const kind = nodeKinds && nodeKinds.has(id) ? nodeKinds.get(id) : (id === rootId ? 'folder' : 'file');
  if (kind !== 'folder' && kind !== 'file') {
    throw new GraphRenderError('invalid-node', `unsupported node kind ${JSON.stringify(kind)}`, id);
  }
  return kind;
}

function requireProjection(projection) {
  if (!projection || typeof projection.toCss !== 'function'
      || !Number.isFinite(projection.width) || !Number.isFinite(projection.height)
      || !Number.isFinite(projection.radius) || projection.radius <= 0) {
    throw new GraphRenderError('invalid-projection', 'a valid projection is required');
  }
  return projection;
}

function normalizePresentation(value) {
  const presentation = { ...DEFAULT_PRESENTATION, ...(value || {}) };
  for (const key of ['background', 'edgeStroke', 'folderFill', 'folderStroke', 'fileFill', 'fileStroke', 'rootFill', 'rootStroke']) {
    assertHexColor(presentation[key], key);
  }
  presentation.edgeWidth = stylePositive(presentation.edgeWidth, 'edgeWidth');
  presentation.nodeStrokeWidth = stylePositive(presentation.nodeStrokeWidth, 'nodeStrokeWidth');
  presentation.defaultNodeRadius = styleNonNegative(presentation.defaultNodeRadius, 'defaultNodeRadius');
  presentation.minNodeRadius = styleNonNegative(presentation.minNodeRadius, 'minNodeRadius');
  presentation.maxArcRadiusCss = stylePositive(presentation.maxArcRadiusCss, 'maxArcRadiusCss');
  if (typeof presentation.transformNodes !== 'boolean') {
    throw new GraphRenderError('invalid-style', 'transformNodes must be boolean');
  }
  return Object.freeze(presentation);
}

function validateEdge(edge) {
  for (const key of ['fromCss', 'toCss']) {
    if (!edge[key] || !Number.isFinite(edge[key].x) || !Number.isFinite(edge[key].y)) {
      throw new GraphRenderError('invalid-edge', `${key} is not finite`);
    }
  }
  if (edge.kind === 'arc') {
    if (!edge.centerCss || !Number.isFinite(edge.centerCss.x) || !Number.isFinite(edge.centerCss.y)
        || !Number.isFinite(edge.radiusCss) || edge.radiusCss <= 0
        || !Number.isFinite(edge.startAngle) || !Number.isFinite(edge.endAngle)
        || typeof edge.sense !== 'boolean') {
      throw new GraphRenderError('invalid-edge', 'arc geometry is not finite');
    }
  }
}

function stylePositive(value, label) {
  try {
    return finitePositive(value, label);
  } catch (error) {
    throw new GraphRenderError('invalid-style', error.message);
  }
}

function styleNonNegative(value, label) {
  try {
    return finiteNonNegative(value, label);
  } catch (error) {
    throw new GraphRenderError('invalid-style', error.message);
  }
}
function normalizeNodeOpacity(value) {
  if (value === undefined) return null;
  if (!(value instanceof Map)) throw new GraphRenderError('invalid-opacity', 'nodeOpacity must be a Map');
  const result = new Map();
  for (const [id, opacity] of value) {
    if (typeof id !== 'string' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new GraphRenderError('invalid-opacity', 'node opacity must be 0..1');
    }
    result.set(id, opacity);
  }
  return result;
}
function opacityFor(map, id) {
  return map.has(id) ? map.get(id) : 1;
}

