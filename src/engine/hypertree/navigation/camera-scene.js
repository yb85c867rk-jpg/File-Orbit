import { GraphRenderError } from '../render/errors.js';
import { normalizeCamera } from './camera.js';

/**
 * Apply the CSS camera once to the prepared scene. Base hyperbolic node radius is
 * already in CSS pixels; camera.zoom scales it exactly once. Edge stroke widths,
 * label text/icon sizes, and selection ring width/gap are not changed here.
 */
export function applyCameraToScene(scene, camera, viewport, limits) {
  if (!scene || !(scene.nodes instanceof Map) || !Array.isArray(scene.edges)) {
    throw new GraphRenderError('invalid-scene', 'prepared scene is required');
  }
  const cam = normalizeCamera(camera, limits);
  const vp = viewport || scene.projection;
  if (!vp || !Number.isFinite(vp.width) || !Number.isFinite(vp.height)
      || vp.width < 0 || vp.height < 0) {
    throw new GraphRenderError('invalid-viewport', 'camera viewport is required');
  }
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const toScreen = (point) => ({
    x: cx + cam.panX + cam.zoom * (point.x - cx),
    y: cy + cam.panY + cam.zoom * (point.y - cy)
  });

  const minNodeRadius = scene.presentation && scene.presentation.minNodeRadius;
  if (!Number.isFinite(minNodeRadius) || minNodeRadius < 0) {
    throw new GraphRenderError('invalid-camera', 'scene presentation minNodeRadius is required');
  }
  const nodes = new Map();
  for (const [id, node] of scene.nodes) {
    const center = toScreen(node.center);
    const radius = node.radius * cam.zoom;
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)
        || !Number.isFinite(radius) || radius < 0) {
      throw new GraphRenderError('invalid-camera', 'camera produced invalid node geometry', id);
    }
    // Base isible is size-based when radius is at/below threshold. A hidden
    // node whose base radius is above threshold is treated as semantic hiding
    // and is never revived by camera zoom.
    const semanticHidden = node.visible === false && node.radius > minNodeRadius;
    const visible = !semanticHidden && radius > minNodeRadius;
    nodes.set(id, {
      ...node,
      center,
      radius,
      visible
    });
  }

  const edges = scene.edges.map((edge) => {
    if (edge.kind === 'line') {
      return {
        ...edge,
        fromCss: toScreen(edge.fromCss),
        toCss: toScreen(edge.toCss)
      };
    }
    return {
      ...edge,
      fromCss: toScreen(edge.fromCss),
      toCss: toScreen(edge.toCss),
      centerCss: toScreen(edge.centerCss),
      radiusCss: edge.radiusCss * cam.zoom
    };
  });
  return {
    ...scene,
    nodes,
    edges,
    camera: { ...cam }
  };
}


