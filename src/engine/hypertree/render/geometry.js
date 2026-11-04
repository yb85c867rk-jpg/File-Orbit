import { GraphRenderError, finiteNumber, finiteNonNegative } from './errors.js';

export const GEOMETRY_TOLERANCE = 1e-12;
export const MAX_ARC_RATIO = 1000;
export const MAX_ARC_RADIUS_CSS = 1_000_000;

/**
 * Hypertree node radius in CSS pixels. The center is projected separately; do
 * not multiply this radius by the projection radius or node.scale.
 *
 * @param {{x:number,y:number,dim:number,transform?:boolean}} options
 */
export function nodeBoundary(options) {
  const x = finiteNumber(options.x, 'node x');
  const y = finiteNumber(options.y, 'node y');
  const dim = finiteNonNegative(options.dim, 'node dim');
  const rho2 = x * x + y * y;
  if (!Number.isFinite(rho2)) throw new GraphRenderError('invalid-number', 'node squared radius is not finite');
  const factor = options.transform === false ? 1 : 1 - rho2;
  const radius = dim * factor;
  if (!Number.isFinite(radius)) throw new GraphRenderError('invalid-number', 'node radius is not finite');
  return { x, y, rho2, factor, radius };
}

/**
 * Hyperline/geodesic geometry through two normalized points.
 *
 * Legacy arc construction is preserved for ordinary points. Coincident,
 * collinear/near-collinear, negative-ratio, non-finite intermediate, and
 * oversized arcs fall back to a straight line. The straight fallback is also
 * used for root-connected/diametric edges with zero determinant.
 *
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 */
export function hyperlineGeometry(from, to, options = {}) {
  const p1 = requirePoint(from, 'from');
  const p2 = requirePoint(to, 'to');
  const tolerance = options.tolerance === undefined ? GEOMETRY_TOLERANCE : finiteNonNegative(options.tolerance, 'tolerance');
  const maxArcRatio = options.maxArcRatio === undefined ? MAX_ARC_RATIO : finiteNumber(options.maxArcRatio, 'maxArcRatio');

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (dx * dx + dy * dy <= tolerance * tolerance) {
    return straight(p1, p2, 'coincident');
  }

  const det = p1.x * p2.y - p1.y * p2.x;
  const detScale = Math.max(1, Math.hypot(p1.x, p1.y) * Math.hypot(p2.x, p2.y));
  if (Math.abs(det) <= tolerance * detScale) {
    return straight(p1, p2, 'collinear');
  }

  const sq1 = p1.x * p1.x + p1.y * p1.y;
  const sq2 = p2.x * p2.x + p2.y * p2.y;
  const a = (p1.y * sq2 - p2.y * sq1 + p1.y - p2.y) / det;
  const b = (p2.x * sq1 - p1.x * sq2 + p2.x - p1.x) / det;
  const center = { x: -a / 2, y: -b / 2 };
  const squaredRatio = (a * a + b * b) / 4 - 1;
  if (![a, b, center.x, center.y, squaredRatio].every(Number.isFinite)) {
    return straight(p1, p2, 'non-finite');
  }
  if (squaredRatio < 0) {
    return straight(p1, p2, 'negative-ratio');
  }
  const ratio = Math.sqrt(squaredRatio);
  if (!Number.isFinite(ratio) || ratio <= tolerance) {
    return straight(p1, p2, ratio <= tolerance ? 'degenerate-arc' : 'oversize');
  }
  if (ratio > maxArcRatio) {
    return straight(p1, p2, 'oversize');
  }

  const startAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
  const endAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
    return straight(p1, p2, 'non-finite-angle');
  }
  return {
    kind: 'arc',
    from: p1,
    to: p2,
    center,
    radius: ratio,
    startAngle,
    endAngle,
    sense: arcSense(startAngle, endAngle),
    fallback: null
  };
}

/** Legacy angle direction helper. */
export function arcSense(startAngle, endAngle) {
  return (startAngle < endAngle)
    ? ((startAngle + Math.PI > endAngle) ? false : true)
    : ((endAngle + Math.PI > startAngle) ? true : false);
}

function straight(from, to, reason) {
  return { kind: 'line', from, to, fallback: reason };
}

function requirePoint(point, label) {
  if (!point || typeof point !== 'object') {
    throw new GraphRenderError('invalid-point', `${label} point is required`);
  }
  return {
    x: finiteNumber(point.x, `${label}.x`),
    y: finiteNumber(point.y, `${label}.y`)
  };
}
