# M3 legacy oracle vendor placement

The M3 angular-width tests use the **actual unchanged** JIT vendor file through
`legacy-layout-oracle.mjs`; they do not ship or copy it.

## Required placement

```text
<project root>/vendor/jit/jit.2.0.1.js
```

## Required SHA-256

```text
4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F
```

The oracle computes this hash before executing the file and fails closed if it
does not match. Do not patch, minify, or re-download a different version for
these tests.

## What the oracle executes

- `Legacy.Graph` + `Legacy.Polar` construction;
- legacy `graph.computeLevels` (isolated graph only);
- actual `Layouts.Radial.setAngularWidthForNodes`;
- actual `Layouts.Radial.setSubtreesAngularWidth` / `setSubtreeAngularWidth`.

It does **not** reimplement legacy formulas. It does **not** execute full
`Layouts.Radial.compute` or radial position parity in this slice.

## Run

```powershell
node --test --test-isolation=none tests/engine/layout/angular-width.test.mjs
```

The default Node test runner child-process isolation hits `EPERM` in the
documented environment, hence `--test-isolation=none`.

The vendor file is intentionally absent from the review ZIP; place it at the
path above before running the oracle.
