# M1 — Hypertree Pure Mathematics

- Date: 2026-10-25
- Scope: only `Complex`, `Polar`, `$C`/`$P`, and pointwise Möbius transform.
- Source of truth: unchanged `jit.js` / `vendor/jit/jit.2.0.1.js` (SHA-256 `4A413A0A…546F`).
- Not in scope: graph traversal, layout, rendering, labels, focus state, DOM.

## 1. Source-to-module mapping

| Legacy source | New module | Status |
|---|---|---|
| `Polar` constructor `3292-3295`; methods `3299-3574`; `$P` `3577`; `Polar.KER` `3579` | `src/engine/hypertree/math/polar.js` | ported |
| `Complex` constructor `3618-3621`; methods `3623-3967`; `$C` `3969`; `Complex.KER`/`IM` `3971-3972` | `src/engine/hypertree/math/complex.js` | ported |
| `Complex.prototype.moebiusTransformation` `17821-17826` | `src/engine/hypertree/math/mobius.js` → `mobiusTransform` | ported as pure function |
| `Graph.Util.moebiusTransformation` `17843-17850` | not ported | layout/graph concern (M2+) |
| `$jit` namespace, `Class`, mixins, prototype assignment | not ported | intentionally excluded |

Module exports:

- `Complex`, `Polar`
- `C(x, y)`, `P(x, y)` (legacy `$C`/`$P`)
- `mobiusTransform(z, c)`
- `COMPLEX_KER`, `POLAR_KER`, `IM`
- errors and constants (`MathValidationError`, `DivisionByZeroError`, `MobiusSingularityError`, `NonFiniteResultError`, `TWO_PI`, `ALMOST_ZERO`)

## 2. Mutation and coordinate conventions (observed)

### Complex

- Fields: `x` (real), `y` (imaginary).
- Non-mutating: `add`, `prod`, `conjugate`, `scale`, `div` (new helper), `clone`, `toPolar`.
- Mutating: `$add`, `$prod`, `$conjugate`, `$scale`, `$div`; each returns `this`.
- `getc()` returns the receiver; `getp()` returns `toPolar()`.
- `toPolar()` normalizes `theta` to `[0, 2π)` with `atan2` and `+ 2π` if negative.
- `equals` is strict in M1 (`===`); legacy used `==`.

### Polar

- Fields: `theta` (radians), `rho` (radius).
- `getc()` = `cos(theta) * rho`, `sin(theta) * rho`.
- `setc(x, y)` computes `rho = sqrt(x² + y²)`, `theta = atan2(y, x)`, adds `2π` if negative.
- `add`/`$add` add `theta` and `rho` component-wise; this is **not** vector addition.
- `$madd` uses JavaScript `%` on `theta` (the result may be negative).
- `interpolate` returns a plain `{ theta, rho }` object, as in legacy.
- `isZero` uses `|theta| < 1e-4 && |rho| < 1e-4`.

### Möbius (exact legacy formula)

For `z` and `c`:

```text
numerator   = z + c
denominator = 1 + conjugate(c) * z
result      = numerator / denominator
```

Operation order follows `jit.js:17821-17826`, including `$prod` then `den.x += 1` then `$div`.

**Legacy mutation (important):** `c` is mutated twice:

1. `c.$conjugate()` → `c = conjugate(c)`;
2. `.$prod(z)` → `c = conjugate(c) * z`;
3. `den.x += 1` → `c.x += 1`.

So after the legacy call, `c` equals the denominator. M1 `mobiusTransform` is **pure** and leaves both inputs unchanged. Tests verify the legacy mutation shape and M1 purity separately.

`Graph.Util.moebiusTransformation` additionally mutates graph node positions via `getPos(prop).set(...)`; it is **not** part of M1.

## 3. Numerical contract

M1 distinguishes four failure categories instead of letting IEEE-754 values leak
through as plausible numbers:

| Category | Condition | Error |
|---|---|---|
| Invalid input | `NaN`, `Infinity`, non-number, `null` | `MathValidationError` |
| True zero/singular denominator | both denominator components are exactly zero | `DivisionByZeroError` / `MobiusSingularityError` |
| Arithmetic overflow | finite inputs produce a non-finite result | `NonFiniteResultError` |
| Underflow / range limitation | exact square/norm is unrepresentable or underflowed | `NumericalRangeError` (where the query itself cannot answer) or a stable fallback |

**Stable fallbacks are not errors when a finite answer is representable.**
`divideComponents` and `Polar.setc` use the legacy formula when the squared norm
is a normal positive double **and the direct numerator/intermediate arithmetic
is finite**. If an intermediate or the final result would overflow/underflow,
they use a scaled/standard calculation instead of returning a plausible wrong
finite value. This preserves ordinary-domain parity while fixing extreme cases.

### Operation audit

| Operation | Behavior |
|---|---|
| `Complex.add/prod/scale/conjugate` | compute locals; non-finite result throws `NonFiniteResultError` |
| `Complex.$add/$prod/$scale` | compute and check before assigning; receiver unchanged on throw |
| `Complex.$div` / `div` | exact legacy path only when denominator squared and all direct numerator/intermediate values are finite; otherwise stable scaled path; returned components checked; true zero throws `DivisionByZeroError` |
| `Complex.norm` | legacy `sqrt(x²+y²)` for normal squares; `Math.hypot` fallback; unrepresentable norm throws `NumericalRangeError` |
| `Complex.squaredNorm` | exact square; throws `NumericalRangeError` if non-finite or if a nonzero vector's square underflows to 0 |
| `Complex.toPolar` | stable norm; finite angle/radius; angle normalized to `[0, 2π)` |
| `Complex.setc/setp/set` | validate all inputs/compute results before assigning (failure-atomic) |
| `Polar.setc` | legacy sqrt for normal squares; hypot fallback for large/small; stores only finite radius or throws `NumericalRangeError` |
| `Polar.toComplex` | checks finite components before constructing Complex |
| `Polar.add/scale/$add/$madd/$scale` | compute/check before constructing or assigning |
| `Polar.interpolate` | computes plain `{theta,rho}`; non-finite result throws |
| `Möbius` | zero test uses denominator components, never squared norm; direct legacy path when safe; scaled path when numerator/denominator overflows |

### Why the additional reproductions happened / fixes

| # | Root cause | Fix |
|---|---|---|
| 1 | `$scale` assigned `Infinity` before any result check | compute both components, check, then assign |
| 2 | `scale` passed an overflowed result to the constructor, which reports it as invalid input | `makeComplex` checks result finiteness first and throws `NonFiniteResultError` |
| 3 | `Polar.setc` stored `sqrt(x²+y²)` even when the square overflowed | stable hypot fallback and explicit finite check before assignment |
| 4 | Möbius used `denominator.squaredNorm()` as the zero test; `1/Infinity` made the result `{0,0}` | test `dx === 0 && dy === 0`; stable division; scaled fallback when components overflow |
| 5 | `Complex.setc` assigned `x` before validating `y` | validate both arguments into locals, then assign both |
| 6 | `$div` treated `squaredNorm() === 0` as a zero denominator | exact zero check on components; stable fallback when the square underflows |
| 7 | direct division path checked only denominator squared, not numerator intermediates (`1e308 * 2` overflowed although true quotient 5e307 is representable) | check every direct intermediate/result; fall back to scaled division; `1e308 / 0.1` throws `NonFiniteResultError` |
| 8 | `norm()` returned `Infinity` for `(MAX_VALUE, MAX_VALUE)` | check hypot output and throw `NumericalRangeError`; `Polar.setc`/`toPolar` use the same range contract |

### Mutation atomicity

All setters and mutating arithmetic follow: **validate inputs → compute/check
result → assign receiver**. This covers `Complex.set/setc/setp` and
`Complex.$add/$prod/$conjugate/$scale/$div`, plus `Polar.set/setc/setp` and
`Polar.$add/$madd/$scale`. A throw leaves the receiver at its previous value.

## 4. Domain, parity, and intentional differences

- Valid input: finite numbers. `undefined` is accepted only through constructor
  defaults (matching omitted legacy arguments).
- Hypertree domain: `|z| <= 1`, `|c| < 1`. M1 does not enforce the disk; it
  supports general finite values up to representability limits.
- Near boundary: `|z| = 1 - 1e-12` is tested; denominator remains nonzero for
  `|c| <= 0.5`.
- Singular: `c = 1`, `z = -1` (and `c = -1`, `z = 1`) yield a zero denominator
  and throw.
- Ordinary-domain parity uses the exact legacy operation order. Stable
  arithmetic is used **only** when the legacy squared norm is non-finite,
  subnormal, or zero for a nonzero denominator; those cases are reported
  separately from exact parity.

| Behavior | Legacy | M1 |
|---|---|---|
| Constructor with `NaN`/`null`/`''` | `x \|\| 0` silently becomes 0 | `MathValidationError` |
| Constructor with `Infinity` | accepted | `MathValidationError` |
| `-0` | normalized to `+0` by `x \|\| 0` | normalized to `+0` explicitly |
| `equals` | loose `==` | strict `===` |
| Complex division by zero | `Infinity`/`NaN` | `DivisionByZeroError` |
| Möbius singular denominator | division by zero → `Infinity`/`NaN` | `MobiusSingularityError` |
| Finite input overflow | `Infinity`/`NaN` | `NonFiniteResultError` |
| `squaredNorm` range | `Infinity`/`0` | `NumericalRangeError` when the exact square is unrepresentable/underflowed |
| `norm` extreme input | `Infinity`/`0` | stable `Math.hypot` fallback |
| `Polar.setc` extreme input | may store `Infinity`/`0` | finite hypot fallback or `NonFiniteResultError` |
| tiny nonzero denominator | may be treated as zero | stable division; exact zero only when both components are 0 |
| `Complex.KER`, `Complex.IM`, `Polar.KER` | mutable shared objects | frozen |
| Möbius input mutation | mutates `c`, denominator and numerator | pure |

Tolerances (declared before comparisons; none were relaxed after a failure):

| Name | Value | Use |
|---|---|---|
| `PARITY_TOLERANCE` | 0 (exact component equality) | valid-domain Complex/Polar/Möbius parity |
| `IDENTITY_TOLERANCE` | 1e-12 relative/absolute | identities, inverses, round trips, extreme stable cases |
| `NEAR_BOUNDARY_TOLERANCE` | 1e-9 relative/absolute | only `\|z\| = 1 - 1e-12` |

The earlier failure was a **test assumption** about legacy mutation
(`cAfter` is the denominator, not the conjugate), not a numerical mismatch.

## 5. Tests (executed)

Command:

```powershell
node --test --test-isolation=none tests/engine/math/math.test.mjs
```

`--test-isolation=none` is required in this sandbox because the default Node test runner spawns a child process and fails with `EPERM`. This is an environment constraint, not a test change.

Result (2026-10-25, contract correction + review follow-up): **16 tests, 16 pass, 0 fail.**

Coverage:

1. Vendor hash and legacy math exposure.
2. Deterministic Complex examples.
3. Fixed-seed valid-domain Complex parity (400 pairs).
4. Fixed-seed Polar parity (250 pairs).
5. Arithmetic identities (associativity, `a * conj(a)`, `a/a`).
6. Polar/Cartesian round trips and `2π` periodic angles (300 cases).
7. Möbius deterministic identities (`T0`, `T(0)=c`, `T(-c)=0`, inverse, disk mapping).
8. Fixed-seed Möbius parity (400 pairs) plus legacy mutation assertion.
9. Near-boundary Möbius parity (40 cases).
10. Singular/invalid/non-finite cases.
11. Intentional validation differences and frozen constants.
12. M1 input purity.
13. Regression: `$scale` overflow, non-mutating `scale` error class, `Polar.setc(1e308,1e308)`, large Möbius, tiny nonzero division.
14. Regression: failure-atomic setters/mutators and receiver state after exceptions.
15. Regression: `norm`/`squaredNorm` range behavior.
16. Regression: representable quotient despite direct intermediate overflow; unrepresentable quotient (mutating/non-mutating); receiver preservation.

Nine explicit reproductions:

1. `new Complex(1e308, 0).$scale(2)` → `NonFiniteResultError`; receiver unchanged.
2. `new Complex(1e308, 0).scale(2)` → `NonFiniteResultError` (not `MathValidationError`).
3. `new Polar().setc(1e308, 1e308)` → finite `rho ≈ hypot(1e308,1e308)`, `theta = π/4`.
4. `mobiusTransform({x:1e100,y:0}, {x:1e100,y:0})` → `{x≈2e-100, y=0}`, not `{0,0}`.
5. `new Complex(1,2).setc(9, NaN)` → `MathValidationError`; receiver stays `(1,2)`.
6. `new Complex(1e-200,0).div(new Complex(1e-200,0))` → `1`, not `DivisionByZeroError`.
7. `new Complex(1e308,0).div(new Complex(2,0))` → finite `5e307`, despite direct `1e308*2` intermediate overflow.
8. `new Complex(1e308,0).div(new Complex(0.1,0))` → `NonFiniteResultError`; mutating form preserves receiver.
9. `new Complex(MAX_VALUE, MAX_VALUE).norm()` → `NumericalRangeError`.

Standalone reproduction script (no test runner child process):

```powershell
node tests/engine/math/reproduce-contract.mjs
```

Result: **All nine reproductions passed**; output is preserved in
`evidence/m1/m1-reproductions-output.txt`.

## 6. Remaining limits

- This is **not** full Hypertree modernization and not browser parity.
- `Graph.Util.moebiusTransformation`, layout, rendering, labels, focus, and animation are M2+.
- Node test runner default isolation is blocked by the environment; only `--test-isolation=none` was used.
- No REA analysis was used to validate this module; REA remains blocked at `source-transfer`.
- The general finite contract does not claim every finite input has a representable result. Unrepresentable results throw explicitly; mixed-magnitude Möbius cases that the scaled form cannot resolve throw `NumericalRangeError` rather than guessing.
- `squaredNorm()` intentionally throws for a nonzero vector whose exact square underflows; this is a range limitation, not a zero denominator.

