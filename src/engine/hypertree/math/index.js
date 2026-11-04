/**
 * M1 Hypertree pure mathematics.
 *
 * No DOM, Canvas, global $jit, prototype mutation, or Class/mixin machinery.
 * See docs/engine/M1-MATH-MAPPING.md for the legacy source mapping and
 * intentional validation differences.
 */
export { Complex, KER as COMPLEX_KER, IM } from './complex.js';
export { Polar, KER as POLAR_KER } from './polar.js';
export { mobiusTransform } from './mobius.js';
export {
  ALMOST_ZERO,
  DivisionByZeroError,
  MathValidationError,
  MobiusSingularityError,
  NonFiniteResultError,
  NumericalRangeError,
  TWO_PI
} from './errors.js';

import { Complex } from './complex.js';
import { Polar } from './polar.js';

/**
 * Legacy `$C(x, y)` helper.
 * @param {number} x
 * @param {number} y
 * @returns {Complex}
 */
export function C(x, y) {
  return new Complex(x, y);
}

/**
 * Legacy `$P(theta, rho)` helper.
 * @param {number} theta
 * @param {number} rho
 * @returns {Polar}
 */
export function P(theta, rho) {
  return new Polar(theta, rho);
}
