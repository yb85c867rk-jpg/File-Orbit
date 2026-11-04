import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Complex,
  Polar,
  mobiusTransform,
  C,
  P,
  COMPLEX_KER,
  POLAR_KER,
  IM,
  MathValidationError,
  DivisionByZeroError,
  MobiusSingularityError,
  NonFiniteResultError,
  NumericalRangeError,
  TWO_PI
} from '../../../src/engine/hypertree/math/index.js';
import { Legacy, legacyMobius } from './legacy-reference.mjs';

/**
 * Tolerances are declared before the comparisons, per the M1 requirement.
 *
 * - PARITY_TOLERANCE: valid-domain formula parity. The new implementation uses
 *   the legacy operation order, so component equality is expected exactly.
 * - IDENTITY_TOLERANCE: algebraic identities with a handful of IEEE-754
 *   operations; absolute/relative 1e-12 is justified by double rounding.
 * - NEAR_BOUNDARY_TOLERANCE: |z| = 1 - 1e-12 amplifies relative error; 1e-9
 *   relative is used only for this explicitly labeled comparison.
 */
const PARITY_TOLERANCE = 0;
const IDENTITY_TOLERANCE = 1e-12;
const NEAR_BOUNDARY_TOLERANCE = 1e-9;

/** @param {number} actual @param {number} expected @param {number} tol @param {string} label */
function assertClose(actual, expected, tol, label) {
  const allowed = tol * Math.max(1, Math.abs(expected));
  const error = Math.abs(actual - expected);
  if (!(error <= allowed)) {
    assert.fail(`${label}: actual=${actual} expected=${expected} error=${error} allowed=${allowed}`);
  }
}

/** @param {number} actual @param {number} expected @param {string} label */
function assertExact(actual, expected, label) {
  assertClose(actual, expected, PARITY_TOLERANCE, label);
}

/** @param {{x:number,y:number}} actual @param {{x:number,y:number}} expected @param {number} tol @param {string} label */
function assertPointClose(actual, expected, tol, label) {
  assertClose(actual.x, expected.x, tol, `${label}.x`);
  assertClose(actual.y, expected.y, tol, `${label}.y`);
}

/** Deterministic PRNG; fixed seeds keep comparisons reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {() => number} random @param {number} maxRadius @returns {Complex} */
function randomDisk(random, maxRadius) {
  const theta = random() * TWO_PI;
  const radius = Math.sqrt(random()) * maxRadius;
  return new Complex(Math.cos(theta) * radius, Math.sin(theta) * radius);
}

test('legacy reference is byte-identical and exposes math', () => {
  assert.equal(typeof Legacy.Complex, 'function');
  assert.equal(typeof Legacy.Polar, 'function');
  assert.equal(typeof Legacy.Complex.prototype.moebiusTransformation, 'function');
});

test('deterministic complex examples', () => {
  const a = C(1, 2);
  const b = C(3, -4);

  assert.deepEqual([a.add(b).x, a.add(b).y], [4, -2]);
  assert.deepEqual([a.prod(b).x, a.prod(b).y], [11, 2]);
  assert.deepEqual([a.conjugate().x, a.conjugate().y], [1, -2]);
  assert.deepEqual([a.scale(2).x, a.scale(2).y], [2, 4]);

  const quotient = C(1, 0).div(C(0, 2));
  assertExact(quotient.x, 0, '1/(2i).x');
  assertExact(quotient.y, -0.5, '1/(2i).y');

  const polar = C(-1, 0).toPolar();
  assert.ok(polar instanceof Polar);
  assertExact(polar.rho, 1, '(-1,0).rho');
  assertExact(polar.theta, Math.PI, '(-1,0).theta');

  const down = C(0, -1).toPolar();
  assertExact(down.theta, (3 * Math.PI) / 2, '(0,-1).theta');

  const back = P(Math.PI, 2).toComplex();
  assertClose(back.x, -2, IDENTITY_TOLERANCE, 'P(pi,2).x');
  assertClose(back.y, 0, IDENTITY_TOLERANCE, 'P(pi,2).y');
});

test('fixed-seed valid-domain parity: Complex arithmetic against legacy', () => {
  const random = mulberry32(0x51ed270b);
  for (let i = 0; i < 400; i += 1) {
    const ax = (random() - 0.5) * 2;
    const ay = (random() - 0.5) * 2;
    const bx = (random() - 0.5) * 2;
    const by = (random() - 0.5) * 2;
    if (bx === 0 && by === 0) continue;

    const a = new Complex(ax, ay);
    const b = new Complex(bx, by);
    const la = new Legacy.Complex(ax, ay);
    const lb = new Legacy.Complex(bx, by);

    const add = a.add(b);
    const ladd = la.add(lb);
    assertExact(add.x, ladd.x, `add.x@${i}`);
    assertExact(add.y, ladd.y, `add.y@${i}`);

    const prod = a.prod(b);
    const lprod = la.prod(lb);
    assertExact(prod.x, lprod.x, `prod.x@${i}`);
    assertExact(prod.y, lprod.y, `prod.y@${i}`);

    const div = a.div(b);
    const ldiv = new Legacy.Complex(ax, ay).$div(new Legacy.Complex(bx, by));
    assertExact(div.x, ldiv.x, `div.x@${i}`);
    assertExact(div.y, ldiv.y, `div.y@${i}`);

    assertExact(a.squaredNorm(), la.squaredNorm(), `squaredNorm@${i}`);
    assertExact(a.norm(), la.norm(), `norm@${i}`);

    const p = a.toPolar();
    const lp = la.toPolar();
    assertExact(p.theta, lp.theta, `toPolar.theta@${i}`);
    assertExact(p.rho, lp.rho, `toPolar.rho@${i}`);

    const pc = new Polar();
    const lpc = new Legacy.Polar();
    pc.setc(ax, ay);
    lpc.setc(ax, ay);
    assertExact(pc.theta, lpc.theta, `setc.theta@${i}`);
    assertExact(pc.rho, lpc.rho, `setc.rho@${i}`);
  }
});

test('fixed-seed valid-domain parity: Polar methods against legacy', () => {
  const random = mulberry32(0x1a2b3c4d);
  for (let i = 0; i < 250; i += 1) {
    const theta = random() * TWO_PI;
    const rho = random() * 3;
    const theta2 = random() * TWO_PI;
    const rho2 = random() * 2;
    const delta = random();

    const a = new Polar(theta, rho);
    const b = new Polar(theta2, rho2);
    const la = new Legacy.Polar(theta, rho);
    const lb = new Legacy.Polar(theta2, rho2);

    const add = a.add(b);
    const ladd = la.add(lb);
    assertExact(add.theta, ladd.theta, `polarAdd.theta@${i}`);
    assertExact(add.rho, ladd.rho, `polarAdd.rho@${i}`);

    const scale = a.scale(1.5);
    const lscale = la.scale(1.5);
    assertExact(scale.theta, lscale.theta, `polarScale.theta@${i}`);
    assertExact(scale.rho, lscale.rho, `polarScale.rho@${i}`);

    const madd = a.clone().$madd(b);
    const lmadd = la.clone().$madd(lb);
    assertExact(madd.theta, lmadd.theta, `polarMadd.theta@${i}`);
    assertExact(madd.rho, lmadd.rho, `polarMadd.rho@${i}`);

    const interp = a.interpolate(b, delta);
    const linterp = la.interpolate(lb, delta);
    assertExact(interp.theta, linterp.theta, `interpolate.theta@${i}`);
    assertExact(interp.rho, linterp.rho, `interpolate.rho@${i}`);

    assert.equal(a.isZero(), la.isZero(), `isZero@${i}`);
  }
});

test('arithmetic identities', () => {
  const random = mulberry32(0xdeadbeef);
  for (let i = 0; i < 200; i += 1) {
    const a = new Complex((random() - 0.5) * 10, (random() - 0.5) * 10);
    const b = new Complex((random() - 0.5) * 10, (random() - 0.5) * 10);
    const c = new Complex((random() - 0.5) * 10, (random() - 0.5) * 10);

    const left = a.add(b).add(c);
    const right = a.add(b.add(c));
    assertPointClose(left, right, IDENTITY_TOLERANCE, 'associativity');

    const norm = a.prod(a.conjugate());
    assertClose(norm.x, a.squaredNorm(), IDENTITY_TOLERANCE, 'a*conj(a).x');
    assertClose(norm.y, 0, IDENTITY_TOLERANCE, 'a*conj(a).y');

    const unit = a.div(a);
    assertClose(unit.x, 1, IDENTITY_TOLERANCE, 'a/a.x');
    assertClose(unit.y, 0, IDENTITY_TOLERANCE, 'a/a.y');
  }
});

test('polar/cartesian round trips and periodic angles', () => {
  const random = mulberry32(0x0badf00d);
  for (let i = 0; i < 300; i += 1) {
    const c = new Complex((random() - 0.5) * 20, (random() - 0.5) * 20);
    const roundTrip = c.toPolar().toComplex();
    assertPointClose(roundTrip, c, IDENTITY_TOLERANCE, `roundTrip@${i}`);

    const p = c.toPolar();
    assert.ok(p.theta >= 0 && p.theta < TWO_PI, `theta range@${i}`);

    const shifted = new Polar(p.theta + TWO_PI, p.rho).toComplex();
    assertPointClose(shifted, c, IDENTITY_TOLERANCE, `periodic@${i}`);

    if (i % 7 === 0) {
      const neg = new Polar();
      neg.setc(c.x, c.y);
      assert.ok(neg.theta >= 0 && neg.theta < TWO_PI, `setc theta range@${i}`);
    }
  }
});

test('Möbius deterministic identities', () => {
  const random = mulberry32(0x12345678);
  for (let i = 0; i < 100; i += 1) {
    const z = randomDisk(random, 0.95);
    const c = randomDisk(random, 0.8);

    const identity = mobiusTransform(z, C(0, 0));
    assertPointClose(identity, z, PARITY_TOLERANCE, `T0@${i}`);

    const atZero = mobiusTransform(C(0, 0), c);
    assertPointClose(atZero, c, IDENTITY_TOLERANCE, `T(0)=c@${i}`);

    const atMinusC = mobiusTransform(c.scale(-1), c);
    assertClose(atMinusC.x, 0, IDENTITY_TOLERANCE, `T(-c).x@${i}`);
    assertClose(atMinusC.y, 0, IDENTITY_TOLERANCE, `T(-c).y@${i}`);

    const forward = mobiusTransform(z, c);
    const back = mobiusTransform(forward, c.scale(-1));
    assertPointClose(back, z, IDENTITY_TOLERANCE, `inverse@${i}`);

    assert.ok(forward.norm() <= 1 + IDENTITY_TOLERANCE, `disk mapping@${i}`);
  }
});

test('fixed-seed Möbius parity against legacy (valid interior)', () => {
  const random = mulberry32(0x77c0ffee);
  for (let i = 0; i < 400; i += 1) {
    const z = randomDisk(random, 0.95);
    const c = randomDisk(random, 0.8);
    const cBefore = c.clone();

    const modern = mobiusTransform(z, c);
    const legacy = legacyMobius(z, c);

    assertExact(modern.x, legacy.x, `mobius.x@${i}`);
    assertExact(modern.y, legacy.y, `mobius.y@${i}`);

    // Legacy mutates c through $conjugate().$prod(z), then den.x += 1.
    // So cAfter is exactly the denominator: conjugate(c) * z + (1, 0).
    const expectedDenominator = cBefore.conjugate().prod(z).add(C(1, 0));
    assertPointClose(legacy.cAfter, expectedDenominator, PARITY_TOLERANCE, `legacy mutation@${i}`);
    assertPointClose(c, cBefore, PARITY_TOLERANCE, `modern purity@${i}`);
  }
});

test('near-boundary Möbius parity and finiteness', () => {
  const random = mulberry32(0xfeedface);
  for (let i = 0; i < 40; i += 1) {
    const theta = random() * TWO_PI;
    const z = new Complex(
      Math.cos(theta) * (1 - 1e-12),
      Math.sin(theta) * (1 - 1e-12)
    );
    const c = randomDisk(random, 0.5);

    const modern = mobiusTransform(z, c);
    const legacy = legacyMobius(z, c);
    assertClose(modern.x, legacy.x, NEAR_BOUNDARY_TOLERANCE, `near.x@${i}`);
    assertClose(modern.y, legacy.y, NEAR_BOUNDARY_TOLERANCE, `near.y@${i}`);
    assert.ok(Number.isFinite(modern.x) && Number.isFinite(modern.y), `near finite@${i}`);

    const back = mobiusTransform(modern, c.scale(-1));
    assertPointClose(back, z, NEAR_BOUNDARY_TOLERANCE, `near inverse@${i}`);
  }
});

test('singular and invalid cases are explicit', () => {
  assert.throws(() => mobiusTransform(C(-1, 0), C(1, 0)), MobiusSingularityError);
  assert.throws(() => mobiusTransform(C(1, 0), C(-1, 0)), MobiusSingularityError);
  assert.throws(() => C(1, 0).div(C(0, 0)), DivisionByZeroError);
  assert.throws(() => C(1, 0).$div(C(0, 0)), DivisionByZeroError);

  assert.throws(() => new Complex(NaN, 0), MathValidationError);
  assert.throws(() => new Complex(0, Infinity), MathValidationError);
  assert.throws(() => new Polar(NaN, 0), MathValidationError);
  assert.throws(() => new Complex(null, 0), MathValidationError);
  assert.throws(() => mobiusTransform(C(NaN, 0), C(0, 0)), MathValidationError);

  // The former 1e308/1e308 case is now computed by the scaled path, not
  // reported as a non-finite result: the exact Möbius value is finite.
  const huge = mobiusTransform(C(1e308, 0), C(1e308, 0));
  assert.ok(Number.isFinite(huge.x) && Number.isFinite(huge.y));
  assertClose(huge.x, 2e-308, IDENTITY_TOLERANCE, 'huge mobius.x');
  assertClose(huge.y, 0, IDENTITY_TOLERANCE, 'huge mobius.y');
});

test('intentional validation differences are documented by behavior', () => {
  // Legacy silently coerces NaN to 0 and accepts Infinity.
  const legacy = new Legacy.Complex(NaN, Infinity);
  assert.equal(legacy.x, 0);
  assert.equal(legacy.y, Infinity);
  assert.throws(() => new Complex(NaN, Infinity), MathValidationError);

  // Legacy preserves -0? It uses `x || 0`, so -0 becomes +0.
  const legacyNegZero = new Legacy.Complex(-0, -0);
  assert.equal(Object.is(legacyNegZero.x, -0), false);
  assert.equal(Object.is(new Complex(-0, -0).x, -0), false);
  assert.equal(Object.is(new Complex(-0, -0).y, -0), false);

  // Shared constants are frozen in M1; legacy constants were mutable.
  assert.ok(Object.isFrozen(COMPLEX_KER));
  assert.ok(Object.isFrozen(POLAR_KER));
  assert.ok(Object.isFrozen(IM));
  assert.throws(() => {
    IM.x = 99;
  }, TypeError);
});

test('legacy Möbius mutation is isolated from M1', () => {
  const z = C(0.3, -0.2);
  const c = C(0.4, 0.1);
  const before = c.clone();
  const modern = mobiusTransform(z, c);
  assertPointClose(c, before, PARITY_TOLERANCE, 'modern input purity');
  assert.ok(Number.isFinite(modern.x));
  assert.ok(Number.isFinite(modern.y));
});

test('regression: overflow and underflow contract', () => {
  // 1. Mutating scale must throw NonFiniteResultError, not store Infinity.
  const scaled = new Complex(1e308, 0);
  assert.throws(() => scaled.$scale(2), NonFiniteResultError);
  assert.equal(scaled.x, 1e308);
  assert.equal(scaled.y, 0);

  // 2. Non-mutating scale must use the same result error, not constructor input error.
  assert.throws(
    () => new Complex(1e308, 0).scale(2),
    NonFiniteResultError
  );

  // 3. Polar.setc(1e308, 1e308) must store a finite radius (hypot fallback).
  const p = new Polar();
  p.setc(1e308, 1e308);
  assert.ok(Number.isFinite(p.rho), `rho=${p.rho}`);
  assertClose(p.rho, Math.hypot(1e308, 1e308), IDENTITY_TOLERANCE, 'setc large rho');
  assertClose(p.theta, Math.PI / 4, IDENTITY_TOLERANCE, 'setc large theta');

  // 4. Möbius must not return {0,0} after the squared denominator overflows.
  const large = mobiusTransform({ x: 1e100, y: 0 }, { x: 1e100, y: 0 });
  assertClose(large.x, 2e-100, IDENTITY_TOLERANCE, 'large mobius.x');
  assertClose(large.y, 0, IDENTITY_TOLERANCE, 'large mobius.y');

  // 6. A nonzero denominator must not be classified as exactly zero because
  // its squared norm underflowed.
  const tiny = new Complex(1e-200, 0).div(new Complex(1e-200, 0));
  assertClose(tiny.x, 1, IDENTITY_TOLERANCE, 'tiny div.x');
  assertClose(tiny.y, 0, IDENTITY_TOLERANCE, 'tiny div.y');

  const tinyMutating = new Complex(1e-200, 0);
  tinyMutating.$div(new Complex(1e-200, 0));
  assertClose(tinyMutating.x, 1, IDENTITY_TOLERANCE, 'tiny $div.x');
  assertClose(tinyMutating.y, 0, IDENTITY_TOLERANCE, 'tiny $div.y');

  // Exact zero remains a true zero denominator.
  assert.throws(() => C(1, 0).div(C(0, 0)), DivisionByZeroError);
});

test('regression: division fallback handles intermediate overflow', () => {
  // Representative quotient despite a non-finite direct intermediate.
  const representable = new Complex(1e308, 0).div(new Complex(2, 0));
  assert.ok(Number.isFinite(representable.x), `x=${representable.x}`);
  assertClose(representable.x, 5e307, IDENTITY_TOLERANCE, 'representable div.x');
  assertClose(representable.y, 0, IDENTITY_TOLERANCE, 'representable div.y');

  const representableMutating = new Complex(1e308, 0);
  representableMutating.$div(new Complex(2, 0));
  assert.ok(Number.isFinite(representableMutating.x));
  assertClose(representableMutating.x, 5e307, IDENTITY_TOLERANCE, 'representable $div.x');

  // Truly unrepresentable quotient: mutating and non-mutating must both throw,
  // and the mutating receiver must be unchanged.
  const unrepresentable = new Complex(1e308, 0);
  assert.throws(
    () => unrepresentable.$div(new Complex(0.1, 0)),
    NonFiniteResultError
  );
  assert.deepEqual([unrepresentable.x, unrepresentable.y], [1e308, 0]);

  assert.throws(
    () => new Complex(1e308, 0).div(new Complex(0.1, 0)),
    NonFiniteResultError
  );
});

test('regression: setters and mutators are failure-atomic', () => {
  // 5. setc(9, NaN) must not leave x changed.
  const c = new Complex(1, 2);
  assert.throws(() => c.setc(9, NaN), MathValidationError);
  assert.deepEqual([c.x, c.y], [1, 2]);

  const p = new Polar(0.5, 2);
  assert.throws(() => p.setc(9, NaN), MathValidationError);
  assert.deepEqual([p.theta, p.rho], [0.5, 2]);

  assert.throws(() => c.setp(0, NaN), MathValidationError);
  assert.deepEqual([c.x, c.y], [1, 2]);

  assert.throws(() => p.setp(NaN, 1), MathValidationError);
  assert.deepEqual([p.theta, p.rho], [0.5, 2]);

  // Mutating arithmetic must not partially assign.
  const add = new Complex(1e308, 0);
  assert.throws(() => add.$add(new Complex(1e308, 0)), NonFiniteResultError);
  assert.deepEqual([add.x, add.y], [1e308, 0]);

  const prod = new Complex(1e308, 0);
  assert.throws(() => prod.$prod(new Complex(1e308, 0)), NonFiniteResultError);
  assert.deepEqual([prod.x, prod.y], [1e308, 0]);

  const div = new Complex(1, 2);
  assert.throws(() => div.$div(C(0, 0)), DivisionByZeroError);
  assert.deepEqual([div.x, div.y], [1, 2]);

  const polarScale = new Polar(1, 1e308);
  assert.throws(() => polarScale.$scale(2), NonFiniteResultError);
  assert.deepEqual([polarScale.theta, polarScale.rho], [1, 1e308]);

  // Finite inputs whose radius is itself unrepresentable are explicit.
  const unrepresentable = new Polar(1, 2);
  assert.throws(() => unrepresentable.setc(Number.MAX_VALUE, Number.MAX_VALUE), NumericalRangeError);
  assert.deepEqual([unrepresentable.theta, unrepresentable.rho], [1, 2]);
});

test('regression: norm helpers and range limitations are explicit', () => {
  const huge = new Complex(1e308, 0);
  assert.ok(Number.isFinite(huge.norm()), 'stable norm is finite');
  assertClose(huge.norm(), 1e308, IDENTITY_TOLERANCE, 'huge norm');
  assert.throws(() => huge.squaredNorm(), NumericalRangeError);

  // The true norm of (MAX_VALUE, MAX_VALUE) is outside the double range.
  assert.throws(
    () => new Complex(Number.MAX_VALUE, Number.MAX_VALUE).norm(),
    NumericalRangeError
  );
  assert.throws(
    () => new Complex(Number.MAX_VALUE, Number.MAX_VALUE).toPolar(),
    NumericalRangeError
  );

  const tiny = new Complex(1e-200, 0);
  assertClose(tiny.norm(), 1e-200, IDENTITY_TOLERANCE, 'tiny norm');
  assert.throws(() => tiny.squaredNorm(), NumericalRangeError);

  const zero = new Complex(0, 0);
  assert.equal(zero.norm(), 0);
  assert.equal(zero.squaredNorm(), 0);

  // A nonzero quotient that underflows to zero is a range error, not a silent 0.
  assert.throws(
    () => new Complex(1e-300, 0).div(new Complex(1e300, 0)),
    NumericalRangeError
  );
});

