# M2 legacy reference placement

The M2 tests use an isolated Node VM copy of the unchanged vendor JIT:

```text
<project root>/vendor/jit/jit.2.0.1.js
```

Expected SHA-256:

```text
4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F
```

`tests/engine/graph/legacy-graph-reference.mjs` resolves this path as
`../../../vendor/jit/jit.2.0.1.js` and aborts if the hash differs.

Do not edit, patch, or replace the vendor file for M2. If the file is missing,
place the unmodified vendor copy at exactly that path; do not substitute a
different JIT build.
