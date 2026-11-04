/**
 * Shared validation and error types for Hypertree M1 pure mathematics.
 *
 * The legacy implementation (jit.js) coerces falsy constructor arguments to 0
 * and lets non-finite values propagate. M1 intentionally validates instead:
 * those differences are documented in docs/engine/M1-MATH-MAPPING.md and are
 * not numerical parity changes.
 */

/** @typedef {{ x: number, y: number }} CartesianLike */
/** @typedef {{ theta: number, rho: number }} PolarLike */

/** Raised when an input is not a finite number. */
export class MathValidationError extends TypeError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'MathValidationError';
  }
}

/** Raised when a complex division has an exactly zero denominator. */
export class DivisionByZeroError extends RangeError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'DivisionByZeroError';
  }
}

/** Raised when a Möbius transform has an exactly singular denominator. */
export class MobiusSingularityError extends RangeError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'MobiusSingularityError';
  }
}

/** Raised when a finite-input computation overflows to Infinity/NaN. */
export class NonFiniteResultError extends RangeError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'NonFiniteResultError';
  }
}

/**
 * Raised when the mathematically exact result is outside the representable
 * double range, or an underflowed intermediate cannot answer the public query.
 * Distinct from invalid input and from a true zero/singular denominator.
 */
export class NumericalRangeError extends RangeError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'NumericalRangeError';
  }
}

/** @type {number} */
export const TWO_PI = Math.PI * 2;

/** Legacy `isZero` epsilon (`0.0001`), preserved for parity. */
export const ALMOST_ZERO = 0.0001;

/**
 * Validate a finite JavaScript number.
 *
 * `undefined` is rejected here; constructors use default parameters so an
 * omitted argument is still a valid 0, matching the legacy default.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
export function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MathValidationError(`${label} must be a finite number`);
  }
  return normalizeZero(value);
}

/**
 * Preserve the legacy constructor's `value || 0` behavior for negative zero
 * while rejecting every other falsy/non-finite value.
 *
 * @param {number} value
 * @returns {number}
 */
export function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Validate an object exposing finite x/y components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {CartesianLike}
 */
export function assertCartesian(value, label) {
  if (value === null || typeof value !== 'object') {
    throw new MathValidationError(`${label} must be an object with x and y`);
  }
  const x = /** @type {{ x?: unknown }} */ (value).x;
  const y = /** @type {{ y?: unknown }} */ (value).y;
  return {
    x: assertFiniteNumber(x, `${label}.x`),
    y: assertFiniteNumber(y, `${label}.y`)
  };
}

/**
 * Validate an object exposing finite theta/rho components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {PolarLike}
 */
export function assertPolar(value, label) {
  if (value === null || typeof value !== 'object') {
    throw new MathValidationError(`${label} must be an object with theta and rho`);
  }
  const theta = /** @type {{ theta?: unknown }} */ (value).theta;
  const rho = /** @type {{ rho?: unknown }} */ (value).rho;
  return {
    theta: assertFiniteNumber(theta, `${label}.theta`),
    rho: assertFiniteNumber(rho, `${label}.rho`)
  };
}
