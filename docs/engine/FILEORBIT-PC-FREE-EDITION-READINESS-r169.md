# FileOrbit PC free-edition completion readiness — r169

**Scope:** PC free edition only. This packet is a review input, not a public launch, deployment, or cross-platform acceptance authorization.

**Recommendation:** **READY FOR PC FREE-EDITION COMPLETION REVIEW**

No known functional PC blocker was found. Native cryptographic equality, native attachment-limit/failure cases, and native multi-tab contention remain documented evidence limitations and are not represented as PASS.

## 1. Candidate identity

- Project: `C:\Users\openw\Documents\Projects\visual-directory`
- The project is **not a Git worktree**; no commit/branch identity exists.
- Candidate baseline archive: `review/fileorbit-encoding-failure-r169.zip`
- Archive SHA-256: `43311D3D4818EE9F91607F1797F224DBA9E37DD646FAEB97A4282F9BED5D0CB9`
- Archive size/count: 21,807,822 bytes; **3,053 files**
- Source/test manifest: `docs/engine/FILEORBIT-PC-FREE-EDITION-SOURCE-MANIFEST-r169.json`
  - 378 files including `README.md` and `vendor/jit`
  - Aggregate source-tree SHA-256: `B383D2061D81BDAFEC4B9FD5865929164C77E4A1D338E838F4A81BC749CDD39F`
  - `src/` + `tests/` subset: 374 files, aggregate `E1D300DC742D1DC218A706170FB570C43662BC3694EA9D1BD9C5337EC60496F9`
- Main candidate hashes:
  - `tests/harness/m5-exploration/main.mjs`: `3060780E1FB7F6C60884DA601FD5C48384D3C575DE27B67FC8B73B6F45975CF8`
  - `tests/engine/exploration/main-harness-init-runner.mjs`: `8E8F87C20933B51F224B1AD28FFFA1A66A49B0B8B056BEDC30A3BCFBAD2EB4DF`

### Packaging correction found

The r169 archive was not fully self-contained: it omitted `vendor/jit/jit.2.0.1.js`, causing the full extracted tests to stop with `ENOENT ... vendor/jit/jit.2.0.1.js` (log: `evidence/native-r121/packet-r169-extracted-remainder.txt`). This is a packaging defect, not an application defect. The unchanged vendor dependency is included in the final PC packet, and the remaining suite was rerun successfully from the extracted candidate with vendor present.

### Packaged source matches the working candidate

The r169 archive was extracted and compared to the working tree:

- 374 source/test files in both
- 0 missing
- 0 extra
- 0 hash differences
- Source/test aggregate `E1D300…` in both

This establishes code identity independently of the archive name.

### Final packet verification

- The final packet includes the unchanged `vendor/jit` files omitted by the r169 archive.
- Extracted final packet source/tests/vendor: **378 files**, aggregate `B383D2061D81BDAFEC4B9FD5865929164C77E4A1D338E838F4A81BC749CDD39F`, exactly matching the tested source tree.
- Final packet `SHA256SUMS`: verified with **0 mismatches**.
- Packaging smoke suite from the final extracted archive: **33/33 PASS**.

### Runtime and tool versions

| Component | Version |
|---|---|
| OS | Microsoft Windows NT 10.0.26300.0 |
| Node.js | v24.12.0 |
| PowerShell | 5.1.26100.9818 |
| Python | 3.14.2 |
| Chrome | 156.0.8078.76 |

Exact Edge, physical-device, and user-session timestamps were not provided and are not invented here.

## 2. User-confirmed manual acceptance

All rows below are **USER-REPORTED PASS**, not independently observed automated evidence.

### Earlier desktop acceptance

| Check | Evidence class | Recorded result |
|---|---|---|
| 300-node map save, reopen, node/content preservation | USER-REPORTED PASS | Earlier desktop build; exact build/browser version not recorded |
| Save As cancellation | USER-REPORTED PASS | Earlier desktop build; exact version not recorded |
| Chrome–Edge external-change detection | USER-REPORTED PASS | Earlier desktop; exact Edge/Chrome versions not recorded |
| Conflict cancellation retains saved version and other window’s unsaved edits | USER-REPORTED PASS | Earlier desktop; byte/hash equality not reported |
| Repeated editor conflict cancellation retains Retry Save / Save As / Close | USER-REPORTED PASS | Earlier desktop |
| 301-node rejection shows limit and preserves 300-node map/file | USER-REPORTED PASS | Earlier desktop; file-hash equality not reported |
| Browser restart then reopen/content preservation | USER-REPORTED PASS | Earlier desktop; node-ID/hash/topology equality not reported |
| Unsaved recovery after restart, attachment preservation, Save As/reopen recovered copy, original-file preservation | USER-REPORTED PASS | Earlier desktop; attachment hash equality not reported |
| r166 conflict wording and picker labels | USER-REPORTED PASS | Earlier r166 request; exact build not recorded |

### PC regression checks explicitly requested against r169

| Check | Evidence class | Recorded result |
|---|---|---|
| Search results, red containing-folder highlights, result navigation/details, changed-query updates, highlight reset, no-results handling | USER-REPORTED PASS | r169-requested; exact build/browser version not supplied |
| Folder dragging, connection/selection alignment, empty-background deselection, Undo/Redo, repeated interaction | USER-REPORTED PASS | r169-requested |
| Text/Korean/line breaks, PDF display/page navigation, images, repeated preview open/close, subsequent map interaction | USER-REPORTED PASS | r169-requested |
| Direct file opening, folder connection without replacement, sidebar file switching, Refresh, standalone files outside connected folder, file/folder picker cancellation | USER-REPORTED PASS | r169-requested |

These user observations are not converted into claims of native SHA-256 equality, node-ID equality, attachment-hash equality, or topology equality.

## 3. Requirements reconciliation

The concise matrix is in [FILEORBIT-PC-FREE-EDITION-ACCEPTANCE-MATRIX-r169.md](FILEORBIT-PC-FREE-EDITION-ACCEPTANCE-MATRIX-r169.md).

Key evidence classes:

- **Automated:** Node 24.12.0 synthetic DOM/IndexedDB/filesystem fixtures, 1,137 tests.
- **Browser automation:** prior Chromium 156 audits and targeted r164/r166/r167/r168/r169 browser evidence.
- **User-reported native PC:** the manual rows above.
- **Native cryptographic equality:** **NOT RUN**; user visual preservation is not treated as equality.

### Boundary cases and remaining gaps

| Item | Current evidence | Disposition |
|---|---|---|
| 300 nodes including root | Automated free-audit and editor tests; user 300/301 observation | PASS automated; user-reported visual PASS |
| 301 rejection preserves map/file | Automated; user-reported visual | PASS automated; user-reported visual PASS; native hash equality NOT RUN |
| 20 MiB per attachment | Automated equality/one-byte-over; r148 browser 20 MiB exact | PASS automated/browser; native large-file picker NOT RUN |
| 100 MiB total attachments | Automated backup/persistence limits | PASS automated; native 100 MiB operation NOT RUN |
| Malformed/truncated/hash-mismatched files | Automated backup/import/load tests | PASS automated; native malformed picker NOT RUN |
| Root/edit restrictions | Automated editor validation/root tests | PASS automated; native not separately reported |
| Save/recovery/write failure handling | Automated P1B, auto-save, recovery, write-failure tests | PASS automated; native quota/disk failure NOT RUN |
| Transient notice ~3 s dismissal | Automated feedback-expiry test | PASS automated only; no manual stopwatch result supplied |
| Native file/attachment hashes, node IDs, topology equality | Not supplied by manual acceptance | **NOT RUN**; documented limitation |
| Native multi-tab storage contention | One skipped fake-IndexedDB concurrency test | NOT RUN natively; limitation |
| Native OS picker/write close trace | User save/reopen workflow observed | User-reported workflow PASS; low-level native trace NOT RUN |

None of these is a known functional failure. The native equality and native failure-injection rows are evidence-depth limitations; automated coverage addresses the corresponding integrity and failure logic.

## 4. Final regression verification

The full serial suite was run on the **extracted r169 archive** (not only the working tree), using the established split strategy because the 69-test `p1b-main` file spawns 69 actual main-entry runners.

Commands:

```powershell
# From extracted r169 archive root
node --test --test-isolation=none --test-concurrency=1 --test-force-exit tests/engine/exploration/p1b-main.test.mjs

$files = Get-ChildItem tests/engine -Recurse -Filter *.test.mjs |
  Where-Object { $_.Name -ne 'p1b-main.test.mjs' } |
  ForEach-Object { $_.FullName }
node --test --test-isolation=none --test-concurrency=1 --test-force-exit @files
```

Results:
- p1b-main on extracted r169 source: **69/69 PASS**, exit 0.
- Remaining suite on extracted candidate with unchanged vendor included: **1,068 tests = 1,067 pass, 1 skip, 0 fail**, exit 0.
- **Aggregate: 1,137 tests = 1,136 pass, 1 skip, 0 fail.**
- The only skip is the existing fake IndexedDB concurrency limitation. It does not exercise native IndexedDB transaction serialization; native multi-tab contention therefore remains unverified.

The final packet focused smoke suite was run from the extracted final archive after packaging: **33/33 PASS**. No test was changed, skipped, or weakened for this packet.

## 5. Free-edition limits

Confirmed in candidate source:

- `EDITOR_MAX_NODES = 300` — nodes including the synthetic root.
- `MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024` — 20 MiB per attachment.
- `MAX_ATTACHMENT_TOTAL_BYTES = 100 * 1024 * 1024` — 100 MiB total attachments.

No paid 1,000-node limit or Upgrade menu is present or in scope.

## 6. PC blockers and limitations

### PC blockers

**None known.** No failing required PC workflow, data-loss defect, save/reopen regression, conflict regression, search/label regression, or preview regression is recorded.

### Documented limitations (non-blocking for this PC review, unless the reviewer requires native cryptographic equality as a gate)

1. Native file SHA-256 equality, attachment SHA-256 equality, node-ID equality, and topology equality were not independently captured; user reports visual/content preservation.
2. Native 100 MiB aggregate-attachment operation, native malformed-file picker, native quota/disk/close failure, and native multi-tab contention were not run.
3. The ~3-second notice dismissal is automated evidence, not a manual timing record.
4. PC acceptance is Chrome/Edge-focused; Edge version was not recorded. Firefox/Safari desktop were not part of this review.
5. The one skipped fake-IndexedDB concurrency test leaves native concurrent transaction serialization unverified.

If item 1 is a mandatory acceptance gate rather than a documented depth limitation, the disposition must change to **BLOCKED** pending native hash/ID/topology capture. This packet does not mislabel it as PASS.

## 7. Deferred / excluded scope

- **Tablet:** NOT RUN / deferred until a device is available.
- **Phones:** paused. The actual-iPhone Safari HTTP encoding issue remains unresolved on device; it is not a verified PC failure and is not part of this PC assessment.
- **Paid 1,000-node edition / Upgrade flow:** future work after free-edition completion; not implemented or evaluated.
- **Deployment, publishing, cloud integration, external hosting:** out of scope.
- **Firefox/Safari desktop, Android, iOS:** not included in this PC packet.

## 8. Evidence references

- r169 report: [FILEORBIT-ENCODING-FAILURE-r169.md](FILEORBIT-ENCODING-FAILURE-r169.md)
- Free-edition audit baseline: [FILEORBIT-FREE-EDITION-AUDIT-r148.md](FILEORBIT-FREE-EDITION-AUDIT-r148.md)
- Corrected PDF/data-safety evidence: [FILEORBIT-DESKTOP-DATA-SAFETY-r150.md](FILEORBIT-DESKTOP-DATA-SAFETY-r150.md)
- Native desktop partial evidence: [FILEORBIT-NATIVE-DESKTOP-ACCEPTANCE-r151.md](FILEORBIT-NATIVE-DESKTOP-ACCEPTANCE-r151.md)
- Conflict wording/picker labels: [FILEORBIT-WORDING-PICKER-LABELS-r166.md](FILEORBIT-WORDING-PICKER-LABELS-r166.md)
- Logs: `evidence/native-r121/packet-r169-extracted-p1b.txt`, `packet-r169-extracted-remainder.txt`
- Source manifest: [FILEORBIT-PC-FREE-EDITION-SOURCE-MANIFEST-r169.json](FILEORBIT-PC-FREE-EDITION-SOURCE-MANIFEST-r169.json)
- Acceptance matrix: [FILEORBIT-PC-FREE-EDITION-ACCEPTANCE-MATRIX-r169.md](FILEORBIT-PC-FREE-EDITION-ACCEPTANCE-MATRIX-r169.md)

## 9. Summary

- **Candidate:** r169 source archive `43311D…`; source/test tree `E1D300…`; no Git revision.
- **Tests:** 1,137 total = 1,136 pass, 1 skip, 0 fail; p1b 69/69 and remaining 1,068 (1,067 pass, 1 skip) both exit 0.
- **User-reported acceptance:** core PC save/open/conflict/limits/restart/recovery and r169 search/drag/preview/opening checks PASS, without native hash/ID/topology equality claims.
- **Remaining PC blockers:** none known; native equality and native failure/quota cases are documented limitations.
- **Deferred:** tablet deferred; phones paused; paid edition future.
- **Recommendation:** **READY FOR PC FREE-EDITION COMPLETION REVIEW**, conditional on acceptance of the documented native evidence-depth limitations. This is not launch/deployment authorization.
