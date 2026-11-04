import { Complex, divideComponents } from './complex.js';
import {
  MobiusSingularityError,
  NonFiniteResultError,
  NumericalRangeError,
  assertCartesian
} from './errors.js';

/**
 * Pointwise Möbius transform used by Hypertree focus/recentering.
 *
 * Exact legacy formula (`jit.js:17821-17826`):
 *
 *   numerator   = z + c
 *   denominator = 1 + conjugate(c) * z
 *   result      = numerator / denominator
 *
 * The legacy method mutates `c` through `c.$conjugate()` and mutates the
 * numerator through `$div`. This function is intentionally pure.
 *
 * Numerical contract:
 * - the zero/singular test uses the denominator components, never a squared
 *   norm that may have overflowed or underflowed;
 * - the ordinary finite path preserves legacy operation order and uses the
 *   exact legacy division;
 * - if a numerator/denominator component overflows, a scaled equivalent is
 *   used, so a finite Möbius value is not silently returned as 0;
 * - if the scaling cannot represent a mixed-magnitude denominator, an explicit
 *   NumericalRangeError is thrown instead of guessing.
 *
 * Hypertree's intended domain is the unit disk (|z| <= 1, |c| < 1). The
 * general finite contract is broader; the large examples below are outside the
 * disk but still must not produce a plausible wrong finite value.
 *
 * @param {Complex | { x: number, y: number }} z
 * @param {Complex | { x: number, y: number }} c
 * @returns {Complex}
 */
export function mobiusTransform(z, c) {
  const zz = assertCartesian(z, 'mobius.z');
  const cc = assertCartesian(c, 'mobius.c');

  const zx = zz.x;
  const zy = zz.y;
  const cx = cc.x;
  const cy = cc.y;

  const numeratorX = zx + cx;
  const numeratorY = zy + cy;
  const negativeCy = -cy;
  const productX = cx * zx - negativeCy * zy;
  const productY = negativeCy * zx + cx * zy;
  const denominatorX = productX + 1;
  const denominatorY = productY;

  if (
    Number.isFinite(numeratorX) &&
    Number.isFinite(numeratorY) &&
    Number.isFinite(denominatorX) &&
    Number.isFinite(denominatorY)
  ) {
    if (denominatorX === 0 && denominatorY === 0) {
      throw new MobiusSingularityError('mobius denominator is exactly zero');
    }
    const result = divideComponents(
      numeratorX,
      numeratorY,
      denominatorX,
      denominatorY,
      'mobius'
    );
    return new Complex(result.x, result.y);
  }

  // At least one direct intermediate overflowed. Scale both inputs by the same
  // factor s: z = s*z', c = s*c'. Then
  //   numerator/s   = z' + c'
  //   denominator/s^2 = 1/s^2 + conjugate(c')*z'
  const scale = Math.max(
    Math.abs(cx),
    Math.abs(cy),
    Math.abs(zx),
    Math.abs(zy)
  );
  if (scale === 0) {
    throw new NumericalRangeError('mobius scaling is undefined for a zero scale');
  }

  const cx1 = cx / scale;
  const cy1 = cy / scale;
  const zx1 = zx / scale;
  const zy1 = zy / scale;

  const scaledNumeratorX = zx1 + cx1;
  const scaledNumeratorY = zy1 + cy1;
  const inverseScaleSquared = 1 / (scale * scale);
  const scaledDenominatorX =
    inverseScaleSquared + cx1 * zx1 + cy1 * zy1;
  const scaledDenominatorY = cx1 * zy1 - cy1 * zx1;

  if (scaledDenominatorX === 0 && scaledDenominatorY === 0) {
    // Both inputs are nonzero (otherwise the direct path would be finite), so
    // this is an inability to represent the mixed-magnitude denominator, not a
    // true singularity.
    throw new NumericalRangeError(
      'mobius scaled denominator is not representable at this magnitude ratio'
    );
  }

  const scaledNumeratorXByScale = scaledNumeratorX / scale;
  const scaledNumeratorYByScale = scaledNumeratorY / scale;
  if (
    !Number.isFinite(scaledNumeratorXByScale) ||
    !Number.isFinite(scaledNumeratorYByScale)
  ) {
    throw new NonFiniteResultError('mobius scaled numerator is not finite');
  }

  const result = divideComponents(
    scaledNumeratorXByScale,
    scaledNumeratorYByScale,
    scaledDenominatorX,
    scaledDenominatorY,
    'mobius'
  );
  if (
    result.x === 0 &&
    result.y === 0 &&
    (numeratorX !== 0 || numeratorY !== 0)
  ) {
    throw new NumericalRangeError('mobius result underflowed to zero');
  }
  return new Complex(result.x, result.y);
}
