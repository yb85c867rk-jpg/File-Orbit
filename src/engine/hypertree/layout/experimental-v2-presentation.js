export const READABLE_GLYPH_RADIUS_CSS = 6;

/**
 * Explicit experimental presentation policy: fixed CSS-pixel glyph radius at
 * every camera zoom. This is not default renderer behavior.
 * Returns a new scene; center, shape, edges, and metadata are preserved.
 */
export function applyFixedGlyphPolicy(scene, options = {}) {
  const radius = options.radius === undefined ? READABLE_GLYPH_RADIUS_CSS : options.radius;
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) {
    throw new TypeError('fixed glyph radius must be finite and positive');
  }
  const nodes = new Map();
  for (const [id, node] of scene.nodes) {
    const nodeRadius = options.radii instanceof Map && options.radii.has(id) ? options.radii.get(id) : radius;
    const style = options.styles instanceof Map ? options.styles.get(id) : null;
    nodes.set(id, { ...node, radius: nodeRadius, visible: true, ...(style ? { fill: style.fill, stroke: style.stroke, shape: style.shape || node.shape } : {}) });
  }
  return {
    ...scene,
    nodes,
    presentationPolicy: {
      kind: options.radii instanceof Map ? 'exploration-depth-radii' : 'fixed-css-glyph',
      radiusCss: options.radii instanceof Map ? null : radius,
      variableRadiusCss: options.radii instanceof Map,
      fixedAcrossZoom: true,
      hitPaddingCss: 0,
      note: 'experimental comparison policy; not a filename-readability guarantee'
    }
  };
}






