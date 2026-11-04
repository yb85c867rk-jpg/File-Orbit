import { Complex } from './complex.js';
import {
  ALMOST_ZERO,
  MathValidationError,
  NonFiniteResultError,
  NumericalRangeError,
  TWO_PI,
  assertFiniteNumber,
  assertPolar,
  normalizeZero
} from './errors.js';

/** Smallest positive normal double; below this, 1/squared can overflow. */
const MIN_NORMAL = 2.2250738585072014e-308;

/**
 * Polar number matching the legacy Hypertree representation.
 *
 * Preserved conventions:
 * - `theta` is an angle in radians, `rho` the radius;
 * - `setc`/`toPolar` normalize the angle to [0, 2*PI);
 * - `add`/`$add` add theta and rho component-wise (they are not vector addition);
 * - `$madd` applies JavaScript `%` (the result can be negative);
 * - `interpolate` returns a plain `{ theta, rho }` object, as in legacy.
 *
 * Numerical contract:
 * - invalid inputs throw MathValidationError before mutation;
 * - `setc` does not store Infinity: a finite pair whose exact radius is
 *   representable is computed with the legacy sqrt, falling back to Math.hypot
 *   only for underflow/overflow of the square; an unrepresentable radius throws
 *   NonFiniteResultError;
 * - mutating operations validate/compute before assigning (failure-atomic).
 */
export class Polar {
  /**
   * @param {number} [theta=0]
   * @param {number} [rho=0]
   */
  constructor(theta = 0, rho = 0) {
    this.theta = assertFiniteNumber(theta, 'Polar.theta');
    this.rho = assertFiniteNumber(rho, 'Polar.rho');
  }

  /**
   * @param {boolean} [simple=false]
   * @returns {Complex | { x: number, y: number }}
   */
  getc(simple = false) {
    return this.toComplex(simple);
  }

  /** @returns {this} */
  getp() {
    return this;
  }

  /**
   * @param {{ getp: () => { theta: number, rho: number } }} value
   * @returns {void}
   */
  set(value) {
    if (!value || typeof value.getp !== 'function') {
      throw new MathValidationError('Polar.set requires a getp() object');
    }
    const p = assertPolar(value.getp(), 'Polar.set');
    this.theta = p.theta;
    this.rho = p.rho;
  }

  /**
   * Failure-atomic setter with stable radius calculation.
   * @param {number} [x=0]
   * @param {number} [y=0]
   * @returns {void}
   */
  setc(x = 0, y = 0) {
    const cx = assertFiniteNumber(x, 'Polar.setc.x');
    const cy = assertFiniteNumber(y, 'Polar.setc.y');
    const squared = cx * cx + cy * cy;

    let rho;
    if (Number.isFinite(squared) && squared >= MIN_NORMAL) {
      rho = Math.sqrt(squared);
    } else if (cx === 0 && cy === 0) {
      rho = 0;
    } else {
      rho = Math.hypot(cx, cy);
    }
    if (!Number.isFinite(rho)) {
      throw new NumericalRangeError('Polar.setc radius exceeds the double range');
    }

    let theta = Math.atan2(cy, cx);
    if (theta < 0) theta += TWO_PI;
    if (!Number.isFinite(theta)) {
      throw new NonFiniteResultError('Polar.setc angle is not representable');
    }

    this.rho = normalizeZero(rho);
    this.theta = normalizeZero(theta);
  }

  /**
   * Failure-atomic setter.
   * @param {number} [theta=0]
   * @param {number} [rho=0]
   * @returns {void}
   */
  setp(theta = 0, rho = 0) {
    const t = assertFiniteNumber(theta, 'Polar.setp.theta');
    const r = assertFiniteNumber(rho, 'Polar.setp.rho');
    this.theta = t;
    this.rho = r;
  }

  /** @returns {Polar} */
  clone() {
    return new Polar(this.theta, this.rho);
  }

  /**
   * Polar -> Cartesian.
   * @param {boolean} [simple=false]
   * @returns {Complex | { x: number, y: number }}
   */
  toComplex(simple = false) {
    const x = Math.cos(this.theta) * this.rho;
    const y = Math.sin(this.theta) * this.rho;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new NonFiniteResultError('Polar.toComplex produced non-finite components');
    }
    return simple ? { x, y } : new Complex(x, y);
  }

  /**
   * @param {Polar} polar
   * @returns {Polar}
   */
  add(polar) {
    const p = assertPolar(polar, 'Polar.add');
    const theta = this.theta + p.theta;
    const rho = this.rho + p.rho;
    if (!Number.isFinite(theta) || !Number.isFinite(rho)) {
      throw new NonFiniteResultError('Polar.add overflowed');
    }
    return new Polar(theta, rho);
  }

  /**
   * @param {number} number
   * @returns {Polar}
   */
  scale(number) {
    const k = assertFiniteNumber(number, 'Polar.scale');
    const rho = this.rho * k;
    if (!Number.isFinite(rho)) {
      throw new NonFiniteResultError('Polar.scale overflowed');
    }
    return new Polar(this.theta, rho);
  }

  /**
   * Strict equality (intentional change from legacy `==`).
   * @param {Polar} c
   * @returns {boolean}
   */
  equals(c) {
    const p = assertPolar(c, 'Polar.equals');
    return this.theta === p.theta && this.rho === p.rho;
  }

  /**
   * Failure-atomic mutating add.
   * @param {Polar} polar
   * @returns {this}
   */
  $add(polar) {
    const p = assertPolar(polar, 'Polar.$add');
    const theta = this.theta + p.theta;
    const rho = this.rho + p.rho;
    if (!Number.isFinite(theta) || !Number.isFinite(rho)) {
      throw new NonFiniteResultError('Polar.$add overflowed');
    }
    this.theta = theta;
    this.rho = rho;
    return this;
  }

  /**
   * Failure-atomic mutating add with theta modulo 2*PI.
   * @param {Polar} polar
   * @returns {this}
   */
  $madd(polar) {
    const p = assertPolar(polar, 'Polar.$madd');
    const theta = (this.theta + p.theta) % TWO_PI;
    const rho = this.rho + p.rho;
    if (!Number.isFinite(theta) || !Number.isFinite(rho)) {
      throw new NonFiniteResultError('Polar.$madd overflowed');
    }
    this.theta = theta;
    this.rho = rho;
    return this;
  }

  /**
   * Failure-atomic mutating scale.
   * @param {number} number
   * @returns {this}
   */
  $scale(number) {
    const k = assertFiniteNumber(number, 'Polar.$scale');
    const rho = this.rho * k;
    if (!Number.isFinite(rho)) {
      throw new NonFiniteResultError('Polar.$scale overflowed');
    }
    this.rho = rho;
    return this;
  }

  /** @returns {boolean} */
  isZero() {
    return Math.abs(this.theta) < ALMOST_ZERO && Math.abs(this.rho) < ALMOST_ZERO;
  }

  /**
   * Legacy angular interpolation. Returns a plain object, not a Polar.
   * @param {Polar} elem
   * @param {number} delta
   * @returns {{ theta: number, rho: number }}
   */
  interpolate(elem, delta) {
    const p = assertPolar(elem, 'Polar.interpolate.elem');
    const d = assertFiniteNumber(delta, 'Polar.interpolate.delta');
    const pi = Math.PI;
    const pi2 = pi * 2;

    /** @param {number} t */
    const ch = (t) => {
      const a = t < 0 ? (t % pi2) + pi2 : t % pi2;
      return a;
    };

    const tt = this.theta;
    const et = p.theta;
    let sum;
    const diff = Math.abs(tt - et);

    if (diff === pi) {
      if (tt > et) {
        sum = ch(et + ((tt - pi2) - et) * d);
      } else {
        sum = ch(et - pi2 + (tt - et) * d);
      }
    } else if (diff >= pi) {
      if (tt > et) {
        sum = ch(et + ((tt - pi2) - et) * d);
      } else {
        sum = ch(et - pi2 + (tt - (et - pi2)) * d);
      }
    } else {
      sum = ch(et + (tt - et) * d);
    }

    const r = (this.rho - p.rho) * d + p.rho;
    if (!Number.isFinite(sum) || !Number.isFinite(r)) {
      throw new NonFiniteResultError('Polar.interpolate overflowed');
    }
    return { theta: sum, rho: r };
  }
}

/** Frozen shared origin (legacy `Polar.KER` was mutable). */
export const KER = Object.freeze(new Polar(0, 0));
