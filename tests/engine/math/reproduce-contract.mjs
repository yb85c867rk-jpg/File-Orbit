/**
 * Standalone reproduction of the six M1 numerical-contract findings.
 * Run with: node tests/engine/math/reproduce-contract.mjs
 * Exit code 0 means every expected outcome was observed.
 */
import {
  Complex,
  Polar,
  mobiusTransform,
  MathValidationError,
  NonFiniteResultError,
  NumericalRangeError
} from '../../../src/engine/hypertree/math/index.js';

let failures = 0;

/** @param {string} label @param {() => void} fn */
function check(label, fn) {
  try {
    fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${error && error.message ? error.message : error}`);
  }
}

/** @param {string} label @param {() => unknown} fn @param {Function} ctor */
function expectThrow(label, fn, ctor) {
  check(label, () => {
    try {
      fn();
    } catch (error) {
      if (error instanceof ctor) return;
      throw new Error(`expected ${ctor.name}, got ${error && error.name}: ${error && error.message}`);
    }
    throw new Error(`expected ${ctor.name}, but nothing was thrown`);
  });
}

/** @param {number} actual @param {number} expected @param {string} label */
function close(actual, expected, label) {
  const allowed = 1e-12 * Math.max(1, Math.abs(expected));
  if (!(Math.abs(actual - expected) <= allowed)) {
    throw new Error(`${label}: actual=${actual} expected=${expected}`);
  }
}

check('1. $scale overflow throws and leaves receiver unchanged', () => {
  const c = new Complex(1e308, 0);
  let threw = false;
  try {
    c.$scale(2);
  } catch (error) {
    if (!(error instanceof NonFiniteResultError)) throw error;
    threw = true;
  }
  if (!threw) throw new Error('no error');
  if (c.x !== 1e308 || c.y !== 0) throw new Error(`receiver=${c.x},${c.y}`);
});

expectThrow(
  '2. non-mutating scale uses NonFiniteResultError',
  () => new Complex(1e308, 0).scale(2),
  NonFiniteResultError
);

check('3. Polar.setc(1e308,1e308) stores a finite radius', () => {
  const p = new Polar();
  p.setc(1e308, 1e308);
  if (!Number.isFinite(p.rho)) throw new Error(`rho=${p.rho}`);
  close(p.rho, Math.hypot(1e308, 1e308), 'rho');
  close(p.theta, Math.PI / 4, 'theta');
});

check('4. large Möbius is finite, not {0,0}', () => {
  const result = mobiusTransform({ x: 1e100, y: 0 }, { x: 1e100, y: 0 });
  close(result.x, 2e-100, 'x');
  close(result.y, 0, 'y');
});

check('5. setc(9,NaN) is failure-atomic', () => {
  const c = new Complex(1, 2);
  let threw = false;
  try {
    c.setc(9, NaN);
  } catch (error) {
    if (!(error instanceof MathValidationError)) throw error;
    threw = true;
  }
  if (!threw) throw new Error('no error');
  if (c.x !== 1 || c.y !== 2) throw new Error(`receiver=${c.x},${c.y}`);
});

check('6. tiny nonzero denominator divides without DivisionByZeroError', () => {
  const result = new Complex(1e-200, 0).div(new Complex(1e-200, 0));
  close(result.x, 1, 'x');
  close(result.y, 0, 'y');
});

check('7. representable quotient survives intermediate overflow', () => {
  const result = new Complex(1e308, 0).div(new Complex(2, 0));
  close(result.x, 5e307, 'x');
  close(result.y, 0, 'y');
});

expectThrow(
  '8. unrepresentable quotient throws',
  () => new Complex(1e308, 0).div(new Complex(0.1, 0)),
  NonFiniteResultError
);

check('8b. unrepresentable mutating quotient preserves receiver', () => {
  const c = new Complex(1e308, 0);
  let threw = false;
  try {
    c.$div(new Complex(0.1, 0));
  } catch (error) {
    if (!(error instanceof NonFiniteResultError)) throw error;
    threw = true;
  }
  if (!threw) throw new Error('no error');
  if (c.x !== 1e308 || c.y !== 0) throw new Error(`receiver=${c.x},${c.y}`);
});

expectThrow(
  '9. unrepresentable norm throws NumericalRangeError',
  () => new Complex(Number.MAX_VALUE, Number.MAX_VALUE).norm(),
  NumericalRangeError
);

if (failures > 0) {
  console.error(`\n${failures} reproduction(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll nine reproductions passed');
}
