> **PDF PREVIEW CLAIM SUPERSEDED BY r150.** The r149 PDF fixture was invalid (69 bytes, no usable page tree) and the iframe-existence check did not prove rendering. See [FILEORBIT-DESKTOP-DATA-SAFETY-r150.md](FILEORBIT-DESKTOP-DATA-SAFETY-r150.md). Historical 300-node evidence and hashes are preserved.

﻿# FileOrbit desktop data-safety report — r149

## Baseline and environment

- Baseline: r148 audit archive `FA523761D3FD4AFDB702C5AFA40476FCDB81EA5D3D4F71A6F252AED56EA91C2B`; r147 preserved.
- Project is **not a Git worktree**; branch/commit/status unavailable.
- Origin: `http://127.0.0.1:8099`
- Browser: headless Chromium `156.0.8078.76`, Windows, default browser context.
- Final test profile: `.browser-prof-r149-final` (dedicated; no user maps).
- Native IndexedDB profile: `.browser-prof-r149` (dedicated).
- Desktop viewport: 1600×1000 CSS px.
- Test storage: dedicated profiles, synthetic `.orbit` fixtures, test download directory only. No unrelated browser storage or real user files were cleared or modified.

## Priority 1 — 300-node committed lifecycle

Fixture: 300 nodes including root; 38 folders, 262 files; wide folder with 58 files; 12-level nested chain; 4 balanced branches; 4 attachments (PDF, Markdown, PNG, text).

The map was **installed through the application’s validated `.orbit` import path**, not the native Create Map save-picker path. Native Create Map commit and native Save As remain manual/NOT RUN (below).

| Check | Result | Evidence |
|---|---|---|
| Exactly 300 nodes committed and rendered | **PASS** | 300 visible / 300 total |
| Wide + nested structure | **PASS** | Wide 58 files; 12 nested levels; 4 branches |
| Navigate into nested folder | **PASS** | focused `deep12` after canvas click |
| Search hidden branch from focused folder | **PASS** | `observable marker` found `wide-057.txt`; 2 highlighted folders (`n0`, `wide`) |
| Follow result / clear search | **PASS** | details showed node and path; clear removed cards/highlight announcement |
| Move / Undo / Redo | **PASS** | w057 parent wide→deep12→wide→deep12→wide; 300 count retained |
| Save to disk `.orbit` | **PASS** | real browser download; 36,942 bytes; decoded tree/attachment bytes verified |
| Reopen downloaded `.orbit` | **PASS** | 300 nodes; normalized topology/metadata equal; 4 attachment SHA-256 values equal |
| Browser reload/restart recovery | **PASS** | process restart same profile/origin; one 300-node checkpoint recovered; tree and bytes equal |
| 301 candidate rejection | **PASS** | status “A map is limited to 300 nodes including its root.”; current map tree and downloaded file unchanged |
| 299/300/301 node and 20 MiB/100 MiB boundaries | **PASS** | automated boundary tests; browser 20 MiB equality/+1 and 301 |

### 300-node timings (artificial waits excluded where noted)

- `.orbit` install/decode: **396.2 ms**
- Search to first result card: **28.6 ms**
- Download preparation/disk completion: **222 ms**
- Reopen app import: **381.9 ms**; wall including page setup/wait: **801 ms**
- Move API action: **272.1 ms**
- Recovery install after restart: **334.6 ms**

Search and save timings include normal event-loop scheduling; they are single-run observations, not benchmark guarantees.

### Saved file integrity

- File: `evidence/native-r121/r149-final-downloads/R149 300 Node Map.orbit`
- Size: **36,942 bytes**
- SHA-256: `5962fee2ab493a371c3868adb1ea49fc1604b1bc6c7b8340a151548f3ca9130e`
- Attachment SHA-256:
  - `report.pdf`: `cfa3181c1ee36e8bce5e39f84959f4558ea7ba32c0e4539a8ab3c8ce8c716ec6`
  - `notes.md`: `63571c33b3ed004f05b2ab43ed4a85ec029d253af2b264308e8e2840b2c08eb4`
  - `pixel.png`: `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`
  - `plain.txt`: `2f497badebdd68b1720a8b352345b1b619daeb709d1c808bfa4647ef0c67a3c9`

### Recovery distinction

The recovered checkpoint was created through the application recovery scheduler. It is **not** proof that an unsaved imported map is automatically recoverable without a checkpoint. The UI continues to use a beforeunload warning for committed unsaved changes; recovery of a checkpoint and unsaved-state warning are distinct.

## Priority 2 — Native IndexedDB

Harness: [native-persistence-audit.mjs](../../tests/harness/m5-exploration/native-persistence-audit.mjs), actual browser `indexedDB`, dedicated DB names; no FakeIndexedDB.

| Check | Result | Evidence |
|---|---|---|
| 5 repeated concurrent legacy/recovery writes against shared 60-byte cap | **PASS** | each iteration: 1 fulfilled, 1 rejected (`recovery-capacity`), usage exactly 60, prior checkpoint intact |
| Reopen DB and verify rows/bytes | **PASS** | 1 candidate, 2 nodes, `recovery.txt` bytes intact each iteration |
| Native transaction abort preserves prior checkpoint/accounting | **PASS** | injected native transaction abort produced `transaction-failed`; usage 6→6; bytes `stable` intact |
| Browser restart persistence | **PASS** | persisted test DB reopened after process restart; 1 candidate, 2 nodes, `persisted-native-bytes`, usage 22 |
| Existing FakeIndexedDB skip retained | **PASS** | skip remains in `recovery.test.mjs`; no native claim removed |

Native abort used a wrapped native IDB transaction that aborts after its first write. It is an injected abort path, not a spontaneous disk or quota failure.

## Priority 3 — Disk save/open and previews

| Check | Result | Evidence |
|---|---|---|
| Actual `.orbit` disk write | **PASS** | browser download completed; file decoded and hashed |
| Actual disk `.orbit` reopen | **PASS** | downloaded file read back into browser and installed; 300 nodes/topology/bytes equal |
| Native Save As picker and cancellation | **NOT RUN** | requires observed headed/native picker interaction |
| Native Open File picker | **NOT RUN** | downloaded bytes were reopened through harness-assisted import |
| PDF preview, 3 open/close cycles | **WITHDRAWN** | iframe shell only; r149 PDF was invalid; see r150 |
| Markdown preview, 3 cycles | **PASS** | literal source with Korean text |
| Text preview, 3 cycles | **PASS** | literal text with Korean text |
| Image preview, 3 cycles | **PASS** | `<img>`; no viewer left open |
| Unavailable attachment feedback | **PASS after fix** | no-attachment file reports “This file has no attachment to preview.” |
| Preview resource cleanup | **PASS** | 50-cycle automated image test revokes every URL; actual 3-cycle closes leave no viewer |

## Defect register

### D-149-01 — Low — no user-visible feedback for unavailable attachment — FIXED
- **Reproduction:** in a real browser, activate an imported file without an attachment (for example `wide-004.txt`).
- **Expected:** explicit contextual unavailable feedback; no preview overlay.
- **Actual before:** `openAttachmentByName` returned without a viewer and details did not state that preview was unavailable.
- **Affected data:** none; no map/file mutation.
- **Fix:** `main.mjs` now calls `setShellStatus('This file has no attachment to preview.')` for the no-attachment branch and reports unavailable/review/unsupported/error viewer states through status feedback.
- **Regression:** `tests/engine/exploration/attachment-unavailable-feedback.test.mjs` passes; cache-disabled real-browser check reports the message.

### D-149-02 — Low — full-suite timing flake under parallel load — PARTIALLY MITIGATED (test harness)
- **Reproduction:** parallel full-suite runs intermittently timed out in copy-encoding destroy/session modes around 15 s.
- **Expected:** deterministic test waits independent of CPU contention.
- **Actual:** fixed waits expired under heavy parallel execution; isolated and serial runs passed.
- **Affected data:** none; tests only.
- **Fix:** copy-encoding wait raised to 30 s, watchdog to 55 s; `openViaFileChoice` waits for the browser overlay instead of asserting immediately. Parallel runs still showed a different subprocess timing failure, so the deterministic full command uses `--test-concurrency=1`.
- **Status:** serial full suite PASS (1119 tests, 1118 pass, 1 skip); parallel full runs still intermittently time out in subprocess tests. This is retained as test-harness sensitivity, not an application failure.

No data-loss, corruption, or broken save/reopen defect was found in the exercised scope.

## PASS / FAIL / NOT RUN

### PASS
- Serial full suite: **1119 tests, 1118 passed, 1 skipped, 0 failed** ([log](../../evidence/native-r121/r149-full-serial.txt)).
- 300-node committed lifecycle, search/navigation, move/Undo/Redo, file save, reopen, restart recovery, 301 rejection.
- Node/attachment boundary tests.
- Native IndexedDB concurrency, abort, reopen, restart persistence.
- Actual disk `.orbit` write and byte comparison.
- Markdown/text/image previews and unavailable feedback; PDF preview claim withdrawn and corrected in r150.
- Serial full suite.

### FAIL
- None in application behavior.
- Parallel full-suite runs exhibited subprocess timing failures (D-149-02); the same tests pass individually and serially.

### NOT RUN
- Native Create Map save-picker commit.
- Native Save As / picker cancellation.
- Native Open File picker.
- Headed Chrome/Edge, Firefox, Safari, Android, iPhone/iPad.
- Native filesystem write failure/quota/full-disk and real multi-tab storage contention.
- Long-duration soak/thermal/battery behavior.

## Readiness

**Free-edition release readiness remains NOT ACCEPTED.**

The tested desktop Chromium scope now has strong tab-local data-safety evidence: exact 300-node topology/metadata/attachment bytes survive save, reopen, and browser-restart recovery, and native IndexedDB concurrency/abort behaved correctly. No data-loss or corruption was observed.

Remaining release blockers are evidence gaps, not observed data failures:
- native picker save/open and cancellation;
- real headed desktop and actual mobile/Firefox/Safari acceptance;
- native filesystem failure handling and multi-tab storage contention;
- long-duration soak.

**Conditional disposition:** continue local desktop Chromium stabilization; do not call the free edition release-ready or mobile-ready yet.
