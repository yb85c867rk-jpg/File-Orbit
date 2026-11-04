import { Polar } from './polar.js';
import {
  ALMOST_ZERO,
  DivisionByZeroError,
  MathValidationError,
  NonFiniteResultError,
  NumericalRangeError,
  TWO_PI,
  assertCartesian,
  assertFiniteNumber,
  normalizeZero
} from './errors.js';

/** Smallest positive normal double; below this, 1/squared can overflow. */
const MIN_NORMAL = 2.2250738585072014e-308;

/**
 * Construct a result only after checking that both components are finite.
 * Input validation stays in the constructor (MathValidationError); a finite
 * input producing a non-finite result is a different, explicit condition.
 *
 * @param {number} x
 * @param {number} y
 * @param {string} label
 * @returns {Complex}
 */
function makeComplex(x, y, label) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new NonFiniteResultError(`${label} produced non-finite components`);
  }
  return new Complex(x, y);
}

/**
 * Stable complex division shared by Complex.$div and Möbius.
 *
 * Ordinary-domain path is the exact legacy formula:
 *   (x*px + y*py) / (px^2 + py^2), (y*px - x*py) / (px^2 + py^2)
 *
 * If the denominator squared norm overflows, underflows, or is subnormal, a
 * scaled/standard algorithm is used. A nonzero denominator is never treated as
 * zero merely because its squared norm underflowed.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} px
 * @param {number} py
 * @param {string} label
 * @returns {{ x: number, y: number }}
 */
export function divideComponents(x, y, px, py, label) {
  if (px === 0 && py === 0) {
    throw new DivisionByZeroError(`${label} denominator is exactly zero`);
  }

  const squared = px * px + py * py;
  if (Number.isFinite(squared) && squared >= MIN_NORMAL) {
    const xp = x * px;
    const yp = y * py;
    const ypx = y * px;
    const xpy = x * py;
    if (
      Number.isFinite(xp) &&
      Number.isFinite(yp) &&
      Number.isFinite(ypx) &&
      Number.isFinite(xpy)
    ) {
      const numeratorX = xp + yp;
      const numeratorY = ypx - xpy;
      if (Number.isFinite(numeratorX) && Number.isFinite(numeratorY)) {
        const inverse = 1 / squared;
        const rx = numeratorX * inverse;
        const ry = numeratorY * inverse;
        if (Number.isFinite(rx) && Number.isFinite(ry)) {
          if (rx === 0 && ry === 0 && (x !== 0 || y !== 0)) {
            throw new NumericalRangeError(`${label} result underflowed to zero`);
          }
          return { x: rx, y: ry };
        }
      }
    }
    // Direct numerator/intermediate arithmetic overflowed. Fall through to the
    // scaled path; the final result may still be representable.
  }

  // Stable fallback for overflow/underflow/subnormal denominators.
  const scale = Math.max(Math.abs(px), Math.abs(py));
  if (scale === 0) {
    throw new DivisionByZeroError(`${label} denominator is exactly zero`);
  }
  const sx = px / scale;
  const sy = py / scale;
  const zx = x / scale;
  const zy = y / scale;
  if (!Number.isFinite(zx) || !Number.isFinite(zy)) {
    throw new NonFiniteResultError(`${label} numerator/denominator scaling overflowed`);
  }

  let rx;
  let ry;
  if (Math.abs(sx) >= Math.abs(sy)) {
    const r = sy / sx;
    const denominator = sx + sy * r;
    rx = (zx + zy * r) / denominator;
    ry = (zy - zx * r) / denominator;
  } else {
    const r = sx / sy;
    const denominator = sx * r + sy;
    rx = (zx * r + zy) / denominator;
    ry = (zy * r - zx) / denominator;
  }

  if (!Number.isFinite(rx) || !Number.isFinite(ry)) {
    throw new NonFiniteResultError(`${label} stable division overflowed`);
  }
  if (rx === 0 && ry === 0 && (x !== 0 || y !== 0)) {
    throw new NumericalRangeError(`${label} result underflowed to zero`);
  }
  return { x: rx, y: ry };
}

/**
 * Complex number with the exact arithmetic used by the legacy Hypertree code.
 *
 * Conventions preserved from `jit.js`:
 * - non-mutating methods return a new instance;
 * - `$`-prefixed methods mutate and return `this`;
 * - `toPolar()` normalizes the angle to [0, 2*PI);
 * - `getc()` returns `this`; `getp()` converts to Polar.
 *
 * Numerical contract:
 * - invalid (non-finite/non-number) inputs throw MathValidationError;
 * - a true zero denominator throws DivisionByZeroError;
 * - finite inputs whose result is not representable throw NonFiniteResultError;
 * - `squaredNorm()` throws NumericalRangeError when the exact square is outside
 *   the double range or underflows while the vector is nonzero;
 * - mutating operations validate/compute before assigning, so they are
 *   failure-atomic.
 */
export class Complex {
  /**
   * @param {number} [x=0]
   * @param {number} [y=0]
   */
  constructor(x = 0, y = 0) {
    this.x = assertFiniteNumber(x, 'Complex.x');
    this.y = assertFiniteNumber(y, 'Complex.y');
  }

  /** @returns {this} */
  getc() {
    return this;
  }

  /**
   * @param {boolean} [simple=false]
   * @returns {Polar | { theta: number, rho: number }}
   */
  getp(simple = false) {
    return this.toPolar(simple);
  }

  /**
   * Set from a Complex/Polar-like object (legacy `c.getc(true)`).
   * Validation completes before either field is assigned.
   * @param {{ getc?: (simple?: boolean) => { x: number, y: number } }} value
   * @returns {void}
   */
  set(value) {
    if (!value || typeof value.getc !== 'function') {
      throw new MathValidationError('Complex.set requires a getc() object');
    }
    const c = assertCartesian(value.getc(true), 'Complex.set');
    this.x = c.x;
    this.y = c.y;
  }

  /**
   * Failure-atomic setter.
   * @param {number} [x=0]
   * @param {number} [y=0]
   * @returns {void}
   */
  setc(x = 0, y = 0) {
    const cx = assertFiniteNumber(x, 'Complex.setc.x');
    const cy = assertFiniteNumber(y, 'Complex.setc.y');
    this.x = cx;
    this.y = cy;
  }

  /**
   * Failure-atomic setter.
   * @param {number} [theta=0]
   * @param {number} [rho=0]
   * @returns {void}
   */
  setp(theta = 0, rho = 0) {
    const t = assertFiniteNumber(theta, 'Complex.setp.theta');
    const r = assertFiniteNumber(rho, 'Complex.setp.rho');
    const x = normalizeZero(Math.cos(t) * r);
    const y = normalizeZero(Math.sin(t) * r);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new NonFiniteResultError('Complex.setp produced non-finite components');
    }
    this.x = x;
    this.y = y;
  }

  /** @returns {Complex} */
  clone() {
    return new Complex(this.x, this.y);
  }

  /**
   * Cartesian -> Polar. Angle is normalized to [0, 2*PI), as in legacy.
   * @param {boolean} [simple=false]
   * @returns {Polar | { theta: number, rho: number }}
   */
  toPolar(simple = false) {
    const rho = this.norm();
    let theta = Math.atan2(this.y, this.x);
    if (theta < 0) theta += TWO_PI;
    if (!Number.isFinite(rho) || !Number.isFinite(theta)) {
      throw new NonFiniteResultError('Complex.toPolar produced a non-finite value');
    }
    return simple ? { theta, rho } : new Polar(theta, rho);
  }

  /**
   * Stable norm. Ordinary values use the legacy sqrt(x^2+y^2); overflow or
   * underflow of the square falls back to Math.hypot so a finite norm is not
   * silently reported as 0 or Infinity.
   * @returns {number}
   */
  norm() {
    const squared = this.x * this.x + this.y * this.y;
    let value;
    if (Number.isFinite(squared) && squared >= MIN_NORMAL) {
      value = Math.sqrt(squared);
    } else {
      value = Math.hypot(this.x, this.y);
    }
    if (!Number.isFinite(value)) {
      throw new NumericalRangeError('Complex.norm exceeds the double range');
    }
    return value;
  }

  /**
   * Exact squared norm. If the mathematical square is outside double range, or
   * underflows to zero while the vector is nonzero, this is a range limitation,
   * not a zero denominator.
   * @returns {number}
   */
  squaredNorm() {
    const squared = this.x * this.x + this.y * this.y;
    if (!Number.isFinite(squared)) {
      throw new NumericalRangeError('Complex.squaredNorm exceeds the double range');
    }
    if (squared === 0 && (this.x !== 0 || this.y !== 0)) {
      throw new NumericalRangeError('Complex.squaredNorm underflowed for a nonzero vector');
    }
    return squared;
  }

  /**
   * @param {Complex} pos
   * @returns {Complex}
   */
  add(pos) {
    const p = assertCartesian(pos, 'Complex.add');
    return makeComplex(this.x + p.x, this.y + p.y, 'Complex.add');
  }

  /**
   * @param {Complex} pos
   * @returns {Complex}
   */
  prod(pos) {
    const p = assertCartesian(pos, 'Complex.prod');
    return makeComplex(
      this.x * p.x - this.y * p.y,
      this.y * p.x + this.x * p.y,
      'Complex.prod'
    );
  }

  /** @returns {Complex} */
  conjugate() {
    return new Complex(this.x, -this.y);
  }

  /**
   * @param {number} factor
   * @returns {Complex}
   */
  scale(factor) {
    const k = assertFiniteNumber(factor, 'Complex.scale');
    return makeComplex(this.x * k, this.y * k, 'Complex.scale');
  }

  /**
   * Non-mutating division helper (legacy only had `$div`).
   * @param {Complex} pos
   * @returns {Complex}
   */
  div(pos) {
    return this.clone().$div(pos);
  }

  /**
   * Strict equality (intentional change from legacy `==`).
   * @param {Complex} c
   * @returns {boolean}
   */
  equals(c) {
    const p = assertCartesian(c, 'Complex.equals');
    return this.x === p.x && this.y === p.y;
  }

  /**
   * Failure-atomic mutating add.
   * @param {Complex} pos
   * @returns {this}
   */
  $add(pos) {
    const p = assertCartesian(pos, 'Complex.$add');
    const x = this.x + p.x;
    const y = this.y + p.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new NonFiniteResultError('Complex.$add overflowed');
    }
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Failure-atomic mutating product.
   * @param {Complex} pos
   * @returns {this}
   */
  $prod(pos) {
    const p = assertCartesian(pos, 'Complex.$prod');
    const x = this.x;
    const y = this.y;
    const nx = x * p.x - y * p.y;
    const ny = y * p.x + x * p.y;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
      throw new NonFiniteResultError('Complex.$prod overflowed');
    }
    this.x = nx;
    this.y = ny;
    return this;
  }

  /** @returns {this} */
  $conjugate() {
    this.y = normalizeZero(-this.y);
    return this;
  }

  /**
   * Failure-atomic mutating scale.
   * @param {number} factor
   * @returns {this}
   */
  $scale(factor) {
    const k = assertFiniteNumber(factor, 'Complex.$scale');
    const x = this.x * k;
    const y = this.y * k;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new NonFiniteResultError('Complex.$scale overflowed');
    }
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Failure-atomic mutating division. Uses the stable helper for extreme
   * denominators, so a nonzero but underflowed squared norm is not "zero".
   * @param {Complex} pos
   * @returns {this}
   */
  $div(pos) {
    const p = assertCartesian(pos, 'Complex.$div');
    const result = divideComponents(this.x, this.y, p.x, p.y, 'Complex.$div');
    if (!Number.isFinite(result.x) || !Number.isFinite(result.y)) {
      throw new NonFiniteResultError('Complex.$div produced non-finite components');
    }
    this.x = result.x;
    this.y = result.y;
    return this;
  }

  /** @returns {boolean} */
  isZero() {
    return Math.abs(this.x) < ALMOST_ZERO && Math.abs(this.y) < ALMOST_ZERO;
  }
}

/** Frozen shared origin (legacy `Complex.KER` was mutable). */
export const KER = Object.freeze(new Complex(0, 0));

/** Frozen shared imaginary unit (legacy `Complex.IM` was mutable). */
export const IM = Object.freeze(new Complex(0, 1));
