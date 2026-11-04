import { GraphRenderError, finiteNonNegative, finitePositive } from './errors.js';
import { assertHexColor } from './colors.js';
import { prepareGraphScene, SCENE_LIMITS } from './scene.js';

export const DEFAULT_SELECTION = Object.freeze({
  color: '#818cf8',
  width: 2,
  gap: 3
});

/**
 * Draw a prepared graph scene. The complete public scene is revalidated into a
 * private drawing snapshot before the first Canvas operation; mutating a
 * previously returned scene cannot bypass drawing validation.
 *
 * @param {object} surface createCanvasSurface instance
 * @param {object} scene prepareGraphScene result
 */
export function drawGraphScene(surface, scene, options = {}) {
  const snapshot = snapshotScene(scene);
  const selection = normalizeSelection(options);
  const highlight = normalizeHighlight(options);
  const highlightedFolders = normalizeHighlightedFolders(options.highlightedFolderIds);
  const activeHighlightId = normalizeActiveHighlightId(options.activeHighlightId);
  if (!surface || typeof surface.getMetrics !== 'function' || !surface.context) {
    throw new GraphRenderError('invalid-scene', 'surface is required');
  }
  const metrics = surface.getMetrics();
  if (metrics.cssWidth === 0 || metrics.cssHeight === 0) {
    return {
      drawnNodes: 0,
      drawnEdges: 0,
      selectionDrawn: false,
      skippedZeroSize: true,
      width: metrics.cssWidth,
      height: metrics.cssHeight
    };
  }
  const ctx = surface.context;
  const presentation = snapshot.presentation;
  let drawnNodes = 0;
  let drawnEdges = 0;
  let selectionDrawn = false;
  let highlightedDrawn = 0;
  let activeHighlighted = false;

  ctx.save();
  try {
    resetDrawingState(ctx);
    surface.clear();
    ctx.fillStyle = presentation.background;
    ctx.fillRect(0, 0, metrics.cssWidth, metrics.cssHeight);

    ctx.strokeStyle = presentation.edgeStroke;
    ctx.lineWidth = presentation.edgeWidth;
    for (const edge of snapshot.edges) {
      ctx.globalAlpha = edge.opacity;
      ctx.strokeStyle = edge.stroke || presentation.edgeStroke;
      ctx.beginPath();
      if (edge.kind === 'line') {
        ctx.moveTo(edge.fromCss.x, edge.fromCss.y);
        ctx.lineTo(edge.toCss.x, edge.toCss.y);
      } else {
        ctx.arc(
          edge.centerCss.x,
          edge.centerCss.y,
          edge.radiusCss,
          edge.startAngle,
          edge.endAngle,
          edge.sense
        );
      }
      ctx.stroke();
      drawnEdges += 1;
    }

    for (const node of snapshot.nodes.values()) {
      if (!node.visible) continue;
    if (node.kind === 'file' && node.shape !== 'circle') continue;
      ctx.globalAlpha = node.opacity;
      ctx.fillStyle = node.fill;
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = presentation.nodeStrokeWidth;
      ctx.beginPath();
      if (node.shape === 'circle') {
        ctx.arc(node.center.x, node.center.y, node.radius, 0, Math.PI * 2);
      } else {
        const r = node.radius;
        ctx.moveTo(node.center.x, node.center.y - r);
        ctx.lineTo(node.center.x + r, node.center.y);
        ctx.lineTo(node.center.x, node.center.y + r);
        ctx.lineTo(node.center.x - r, node.center.y);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      drawnNodes += 1;
    }

    if (highlightedFolders.size > 0) {
      for (const id of highlightedFolders) {
        const node = snapshot.nodes.get(id);
        if (!node || !node.visible || node.kind !== 'folder' || node.shape !== 'circle' || node.radius <= 0) continue;
        ctx.globalAlpha = node.opacity;
        drawHighlightRing(ctx, node, highlight);
        highlightedDrawn += 1;
      }
    }

    if (activeHighlightId !== null) {
      const active = snapshot.nodes.get(activeHighlightId);
      if (active && active.visible && active.radius > 0) {
        ctx.globalAlpha = active.opacity;
        drawNodeOutline(ctx, active, highlight, { width: highlight.activeWidth, gap: highlight.activeGap, dashed: false });
        activeHighlighted = true;
      }
    }

    if (selection.selectedId !== null) {
      const selected = snapshot.nodes.get(selection.selectedId);
      if (selected && selected.visible && selected.radius > 0 && selected.shape === 'circle') {
        ctx.globalAlpha = selected.opacity;
        drawSelectionRing(ctx, selected, selection);
        selectionDrawn = true;
      }
    }
  } finally {
    ctx.restore();
  }

  return {
    drawnNodes,
    drawnEdges,
    selectionDrawn,
    highlightedFolders: highlightedDrawn,
    skippedZeroSize: false,
    width: metrics.cssWidth,
    height: metrics.cssHeight
  };
}

/** Convenience composition for callers that already have a staged result. */
export function renderGraphScene(surface, staged, options = {}) {
  const { selection, selectedId, ...sceneOptions } = options;
  return drawGraphScene(
    surface,
    prepareGraphScene(staged, sceneOptions),
    { selection, selectedId }
  );
}

function normalizeSelection(options) {
  const raw = options && options.selection !== undefined ? options.selection : {};
  if (!raw || typeof raw !== 'object') {
    throw new GraphRenderError('invalid-selection', 'selection must be an object when provided');
  }
  const selectedId = options && options.selectedId !== undefined ? options.selectedId : null;
  if (selectedId !== null && typeof selectedId !== 'string') {
    throw new GraphRenderError('invalid-selection', 'selectedId must be a string or null');
  }
  const color = raw.color === undefined ? DEFAULT_SELECTION.color : raw.color;
  assertHexColor(color, 'selection.color');
  const width = raw.width === undefined ? DEFAULT_SELECTION.width : stylePositive(raw.width, 'selection.width');
  const gap = raw.gap === undefined ? DEFAULT_SELECTION.gap : styleNonNegative(raw.gap, 'selection.gap');
  return { selectedId: selectedId === null ? null : selectedId, color, width, gap };
}

function normalizeActiveHighlightId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new GraphRenderError('invalid-highlight', 'activeHighlightId must be a string or null');
  return value;
}

function normalizeHighlightedFolders(value) {
  if (value === undefined || value === null) return new Set();
  if (!(value instanceof Set) && !Array.isArray(value)) throw new GraphRenderError('invalid-highlight', 'highlightedFolderIds must be a Set or array');
  const ids = new Set();
  for (const id of value) { if (typeof id !== 'string') throw new GraphRenderError('invalid-highlight', 'highlighted folder id must be a string'); ids.add(id); }
  return ids;
}

function normalizeHighlight(options) {
  const raw = options && options.highlight !== undefined ? options.highlight : {};
  if (!raw || typeof raw !== 'object') throw new GraphRenderError('invalid-highlight', 'highlight must be an object when provided');
  const color = raw.color === undefined ? '#FCA5A5' : raw.color;
  assertHexColor(color, 'highlight.color');
  const width = raw.width === undefined ? 1.5 : stylePositive(raw.width, 'highlight.width');
  const gap = raw.gap === undefined ? 5 : styleNonNegative(raw.gap, 'highlight.gap');
  const activeWidth = raw.activeWidth === undefined ? Math.max(width + 1.5, width * 2) : stylePositive(raw.activeWidth, 'highlight.activeWidth');
  const activeGap = raw.activeGap === undefined ? gap + 2 : styleNonNegative(raw.activeGap, 'highlight.activeGap');
  return { color, width, gap, activeWidth, activeGap };
}

function drawHighlightRing(ctx, node, highlight) {
  drawNodeOutline(ctx, node, highlight, { width: highlight.width, gap: highlight.gap, dashed: true });
}

function drawNodeOutline(ctx, node, highlight, { width = highlight.width, gap = highlight.gap, dashed = true } = {}) {
  const ringRadius = node.radius + gap;
  if (!Number.isFinite(ringRadius) || ringRadius <= 0) return;
  ctx.strokeStyle = highlight.color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [3, 2] : []);
  ctx.beginPath();
  if (node.shape === 'circle') {
    ctx.arc(node.center.x, node.center.y, ringRadius, 0, Math.PI * 2);
  } else {
    const r = ringRadius;
    ctx.moveTo(node.center.x, node.center.y - r);
    ctx.lineTo(node.center.x + r, node.center.y);
    ctx.lineTo(node.center.x, node.center.y + r);
    ctx.lineTo(node.center.x - r, node.center.y);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSelectionRing(ctx, node, selection) {
  const ringRadius = node.radius + selection.gap;
  if (!Number.isFinite(ringRadius) || ringRadius <= 0) return;
  ctx.strokeStyle = selection.color;
  ctx.lineWidth = selection.width;
  ctx.setLineDash([]);
  ctx.beginPath();
  if (node.shape === 'circle') {
    ctx.arc(node.center.x, node.center.y, ringRadius, 0, Math.PI * 2);
  } else {
    const r = ringRadius;
    ctx.moveTo(node.center.x, node.center.y - r);
    ctx.lineTo(node.center.x + r, node.center.y);
    ctx.lineTo(node.center.x, node.center.y + r);
    ctx.lineTo(node.center.x - r, node.center.y);
    ctx.closePath();
  }
  ctx.stroke();
}
function snapshotScene(scene) {
  if (!scene || typeof scene !== 'object' || !(scene.nodes instanceof Map) || !Array.isArray(scene.edges)) {
    throw new GraphRenderError('invalid-scene', 'prepared scene is required');
  }
  const presentation = snapshotPresentation(scene.presentation);
  if (scene.nodes.size > SCENE_LIMITS.maxNodes) {
    throw new GraphRenderError('scene-limit', `node count exceeds ${SCENE_LIMITS.maxNodes}`);
  }
  if (scene.edges.length > SCENE_LIMITS.maxEdges) {
    throw new GraphRenderError('scene-limit', `edge count exceeds ${SCENE_LIMITS.maxEdges}`);
  }

  const nodes = new Map();
  for (const [id, node] of scene.nodes) {
    if (typeof id !== 'string' || !node || node.id !== id) {
      throw new GraphRenderError('invalid-node', 'node id is invalid');
    }
    if (node.kind !== 'folder' && node.kind !== 'file') {
      throw new GraphRenderError('invalid-node', 'node kind is unsupported', id);
    }
    if (node.shape !== 'circle' && node.shape !== 'diamond') {
      throw new GraphRenderError('invalid-node', 'node shape is unsupported', id);
    }
    if (typeof node.visible !== 'boolean') {
      throw new GraphRenderError('invalid-node', 'node visibility must be boolean', id);
    }
    if (!node.center || !Number.isFinite(node.center.x) || !Number.isFinite(node.center.y)) {
      throw new GraphRenderError('invalid-node', 'node center is not finite', id);
    }
    if (!Number.isFinite(node.radius) || node.radius < 0) {
      throw new GraphRenderError('invalid-node', 'node radius is invalid', id);
    }
    assertHexColor(node.fill, `${id}.fill`);
    assertHexColor(node.stroke, `${id}.stroke`);
    const opacity = node.opacity === undefined ? 1 : node.opacity;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new GraphRenderError('invalid-node', 'node opacity must be 0..1', id);
    }
    nodes.set(id, {
      id,
      kind: node.kind,
      shape: node.shape,
      visible: node.visible,
      center: { x: node.center.x, y: node.center.y },
      radius: node.radius,
      fill: node.fill,
      stroke: node.stroke,
      opacity
    });
  }

  const edges = [];
  for (const edge of scene.edges) {
    if (!edge || typeof edge !== 'object') {
      throw new GraphRenderError('invalid-edge', 'edge record is required');
    }
    if (typeof edge.fromId !== 'string' || typeof edge.toId !== 'string'
        || !nodes.has(edge.fromId) || !nodes.has(edge.toId)) {
      throw new GraphRenderError('invalid-edge', 'edge endpoints are invalid');
    }
    if (edge.kind !== 'line' && edge.kind !== 'arc') {
      throw new GraphRenderError('invalid-edge', 'edge kind is unsupported');
    }
    if (!finitePoint(edge.fromCss) || !finitePoint(edge.toCss)) {
      throw new GraphRenderError('invalid-edge', 'edge endpoints are not finite');
    }
    if (typeof edge.stroke !== 'string') {
      throw new GraphRenderError('invalid-edge', 'edge stroke is required');
    }
    assertHexColor(edge.stroke, `${edge.fromId}->${edge.toId}.stroke`);
    const width = stylePositive(edge.width, 'edge width');
    const opacity = edge.opacity === undefined ? 1 : edge.opacity;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new GraphRenderError('invalid-edge', 'edge opacity must be 0..1');
    }
    if (edge.kind === 'arc') {
      if (!edge.centerCss || !finitePoint(edge.centerCss)
          || !Number.isFinite(edge.radiusCss) || edge.radiusCss <= 0
          || !Number.isFinite(edge.startAngle) || !Number.isFinite(edge.endAngle)
          || typeof edge.sense !== 'boolean') {
        throw new GraphRenderError('invalid-edge', 'arc geometry is invalid');
      }
      edges.push({
        fromId: edge.fromId,
        toId: edge.toId,
        kind: 'arc',
        fromCss: { x: edge.fromCss.x, y: edge.fromCss.y },
        toCss: { x: edge.toCss.x, y: edge.toCss.y },
        centerCss: { x: edge.centerCss.x, y: edge.centerCss.y },
        radiusCss: edge.radiusCss,
        startAngle: edge.startAngle,
        endAngle: edge.endAngle,
        sense: edge.sense,
        stroke: edge.stroke,
        width,
        opacity
      });
    } else {
      edges.push({
        fromId: edge.fromId,
        toId: edge.toId,
        kind: 'line',
        fromCss: { x: edge.fromCss.x, y: edge.fromCss.y },
        toCss: { x: edge.toCss.x, y: edge.toCss.y },
        stroke: edge.stroke,
        width,
        opacity
      });
    }
  }
  return { presentation, nodes, edges };
}

function snapshotPresentation(value) {
  if (!value || typeof value !== 'object') {
    throw new GraphRenderError('invalid-style', 'presentation is required');
  }
  for (const key of ['background', 'edgeStroke', 'folderFill', 'folderStroke', 'fileFill', 'fileStroke', 'rootFill', 'rootStroke']) {
    assertHexColor(value[key], key);
  }
  return {
    background: value.background,
    edgeStroke: value.edgeStroke,
    edgeWidth: stylePositive(value.edgeWidth, 'edgeWidth'),
    nodeStrokeWidth: stylePositive(value.nodeStrokeWidth, 'nodeStrokeWidth'),
    // These are not directly drawn here but remain part of the prepared scene.
    defaultNodeRadius: styleNonNegative(value.defaultNodeRadius, 'defaultNodeRadius'),
    minNodeRadius: styleNonNegative(value.minNodeRadius, 'minNodeRadius'),
    maxArcRadiusCss: stylePositive(value.maxArcRadiusCss, 'maxArcRadiusCss'),
    transformNodes: typeof value.transformNodes === 'boolean'
      ? value.transformNodes
      : (() => { throw new GraphRenderError('invalid-style', 'transformNodes must be boolean'); })()
  };
}

function finitePoint(point) {
  return point && typeof point === 'object' && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function stylePositive(value, label) {
  try { return finitePositive(value, label); } catch (error) { throw new GraphRenderError('invalid-style', error.message); }
}

function styleNonNegative(value, label) {
  try { return finiteNonNegative(value, label); } catch (error) { throw new GraphRenderError('invalid-style', error.message); }
}

function resetDrawingState(ctx) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.filter = 'none';
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.miterLimit = 10;
}

















