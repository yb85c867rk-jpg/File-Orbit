import { GraphRenderError } from '../render/errors.js';
import { SCENE_LIMITS } from '../render/scene.js';

export const HIT_PADDING_CSS = 0;

/**
 * Install an immutable hit-test snapshot from the same prepared scene used for
 * drawing. Public scene mutation after this call cannot alter installed targets.
 *
 * O(N) lookup; no spatial index in this slice.
 *
 * @param {object} scene prepareGraphScene result
 */
export function createHitSnapshot(scene) {
  if (!scene || typeof scene !== 'object' || !(scene.nodes instanceof Map)) {
    throw new GraphRenderError('invalid-hit-scene', 'prepared scene with node Map is required');
  }
  if (scene.nodes.size > SCENE_LIMITS.maxNodes) {
    throw new GraphRenderError('invalid-hit-scene', `node count exceeds ${SCENE_LIMITS.maxNodes}`);
  }
  const nodes = [];
  for (const [id, node] of scene.nodes) {
    if (typeof id !== 'string' || !node || node.id !== id) {
      throw new GraphRenderError('invalid-hit-scene', 'node id must be a string matching its record', id);
    }
    if (node.kind !== 'folder' && node.kind !== 'file') {
      throw new GraphRenderError('invalid-hit-scene', 'node kind is unsupported', id);
    }
    if (node.shape !== 'circle' && node.shape !== 'diamond') {
      throw new GraphRenderError('invalid-hit-scene', 'node shape is unsupported', id);
    }
    if (typeof node.visible !== 'boolean') {
      throw new GraphRenderError('invalid-hit-scene', 'node visibility must be boolean', id);
    }
    if (!node.center || !Number.isFinite(node.center.x) || !Number.isFinite(node.center.y)) {
      throw new GraphRenderError('invalid-hit-scene', 'node center must be finite', id);
    }
    if (typeof node.radius !== 'number' || !Number.isFinite(node.radius) || node.radius < 0) {
      throw new GraphRenderError('invalid-hit-scene', 'node radius must be finite and nonnegative', id);
    }
    nodes.push(Object.freeze({
      id,
      kind: node.kind,
      shape: node.shape,
      visible: node.visible,
      center: Object.freeze({ x: node.center.x, y: node.center.y }),
      radius: node.radius
    }));
  }
  return Object.freeze({
    nodes: Object.freeze(nodes),
    padding: HIT_PADDING_CSS
  });
}

/**
 * Return the last drawn matching node ID, or null.
 *
 * Circle: filled/rendered circle; diamond: actual four-vertex diamond. Stroke
 * width and decorative selection rings do not contribute. Extra padding is zero.
 *
 * @param {object} snapshot createHitSnapshot result
 * @param {{x:number,y:number}} point canvas-local CSS pixels
 */
export function hitTestNode(snapshot, point) {
  if (!snapshot || !Array.isArray(snapshot.nodes)) {
    throw new GraphRenderError('invalid-hit-scene', 'hit snapshot is required');
  }
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new GraphRenderError('invalid-point', 'hit point must be finite');
  }
  for (let index = snapshot.nodes.length - 1; index >= 0; index -= 1) {
    const node = snapshot.nodes[index];
    if (!node.visible || node.radius <= 0) continue;
    if (node.kind === 'file' && node.shape !== 'circle') continue;
    const dx = point.x - node.center.x;
    const dy = point.y - node.center.y;
    const inside = node.shape === 'circle'
      ? dx * dx + dy * dy <= node.radius * node.radius
      : Math.abs(dx) + Math.abs(dy) <= node.radius;
    if (inside) return node.id;
  }
  return null;
}

/** Whether an ID is currently hittable in this snapshot. */
export function snapshotContainsHittableId(snapshot, id) {
  if (!snapshot || !Array.isArray(snapshot.nodes) || typeof id !== 'string') return false;
  return snapshot.nodes.some((node) => node.id === id && node.visible && node.radius > 0 && (node.kind === 'folder' || node.shape === 'circle'));
}










