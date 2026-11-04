/**
 * Pure normalized-Hypertree <-> CSS coordinate conversion.
 *
 * Normalized coordinates are the Cartesian form of Hypertree Polar positions
 * (x = rho*cos(theta), y = rho*sin(theta)). CSS coordinates use the canvas
 * top-left origin; the Hypertree origin is the CSS viewport center. y points
 * down, matching Canvas/Hypertree drawing.
 */

/**
 * @param {{width:number, height:number, radius:number}} options
 * @returns {object}
 */
export function createProjection(options) {
  const width = finiteNonNegative(options && options.width, 'projection width');
  const height = finiteNonNegative(options && options.height, 'projection height');
  const radius = finitePositive(options && options.radius, 'projection radius');
  const centerX = width / 2;
  const centerY = height / 2;

  return Object.freeze({
    width,
    height,
    radius,
    centerX,
    centerY,

    /** @param {number} x @param {number} y */
    toCss(x, y) {
      return {
        x: centerX + finite(x, 'normalized x') * radius,
        y: centerY + finite(y, 'normalized y') * radius
      };
    },

    /** @param {number} cssX @param {number} cssY */
    fromCss(cssX, cssY) {
      return {
        x: (finite(cssX, 'css x') - centerX) / radius,
        y: (finite(cssY, 'css y') - centerY) / radius
      };
    },

    /** @param {{x:number,y:number}} css @param {{left:number,top:number}} rect */
    toClient(css, rect) {
      const point = requirePoint(css, 'css point');
      const origin = requireRect(rect);
      return { x: origin.left + point.x, y: origin.top + point.y };
    },

    /** @param {{x:number,y:number}} client @param {{left:number,top:number}} rect */
    fromClient(client, rect) {
      const point = requirePoint(client, 'client point');
      const origin = requireRect(rect);
      return { x: point.x - origin.left, y: point.y - origin.top };
    }
  });
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function finiteNonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must be >= 0`);
  return number;
}

function finitePositive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} must be > 0`);
  return number;
}

function requirePoint(point, label) {
  if (!point || typeof point !== 'object') throw new TypeError(`${label} is required`);
  return { x: finite(point.x, `${label} x`), y: finite(point.y, `${label} y`) };
}

function requireRect(rect) {
  if (!rect || typeof rect !== 'object') throw new TypeError('rect is required');
  return { left: finite(rect.left, 'rect.left'), top: finite(rect.top, 'rect.top') };
}
