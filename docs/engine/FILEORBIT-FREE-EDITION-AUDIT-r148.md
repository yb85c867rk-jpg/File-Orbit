# FileOrbit free-edition stability audit — r148

Candidate baseline: **r147** (`review/fileorbit-review-r147.zip`, SHA-256 `4993FAC1A439BB46C330A47CA9B108599611BC22BA4F9ABB18CB5EDFBA2AB908`).
Audit date: 2026-11-02 (Pacific/Auckland).

## 1. Baseline identity and working tree

- The project is **not a Git worktree**. `git rev-parse` / `git status` fail with “not a git repository”; no branch, commit, or tracked worktree status exists.
- Baseline source hashes:
  - `tests/harness/m5-exploration/main.mjs`: `A59AEEDA2D8F111BC01673F66A543AEFE491B9D4A07336B411EFA3AA11259DB2`
  - `tests/harness/m5-exploration/index.html`: `7F7D2B5A4E01EDED877A27C3C52B63984AB87BF6EF63E46E2A3128E3CC4B2BA2`
- r147 archive verified as the candidate baseline; r146 archive preserved (`9F4914564F317F9A6F251A53E831438C3C556B1EB530F09C66837646B22D7953`).
- Existing untracked local artifacts (browser profiles, zips, scratch files) were preserved. This audit added tests, documentation, and evidence only; no application source behavior was changed.

## 2. Supported targets versus evidence

Design targets recorded in the persistence plan:
- desktop Chrome/Edge (PC)
- Android Chrome
- iPhone/iPad Safari browser or installed PWA

Evidence actually obtained in this audit:
- **Automated Node:** Windows, Node v24.12.0, synthetic DOM/IndexedDB/filesystem fixtures.
- **Real browser (headless Chromium 156 on Windows):** desktop and 390×844 viewport emulation.
- **Actual Android/iOS/Firefox/Safari/Edge native:** **NOT RUN**. No ADB/device target was available; viewport emulation is not treated as mobile acceptance.

## 3. Feature test matrix

| # | Workflow | Automated | Real browser | Native / actual device | Status |
|---|---|---|---|---|---|
| 1 | Create from files/folders, Unicode, empty folders, duplicate paths, cancellation | PASS | PASS for duplicate rejection, Unicode preview/cancel; folder picker not exercised | Native picker/empty-folder capture NOT RUN | PASS (tested scope) |
| 2 | 299/300/301 nodes; per-file/total attachment boundaries; rejection preserves map | PASS | PASS: 299 files + root accepted; 300 files + root rejected; 20 MiB exact accepted; 20 MiB + 1 rejected; current map stayed 20/20 | Native 100 MiB total selection NOT RUN | PASS (tested scope) |
| 3 | Navigate, hidden-branch search, follow results, clear, replace, failed replacement | PASS | PASS: 1 match, 4 highlighted folders, clear, F20→F200; failed replacement is automated | Native drag/search hardware NOT RUN | PASS (tested scope) |
| 4 | Move, Undo/Redo, cancel edits, overlapping/delayed ops | PASS | NOT RUN as native drag | Native pointer/IME/drag NOT RUN | PASS (automated) |
| 5 | Save/reopen, auto-save, export/import, recovery, storage/write failures, corrupt files | PASS (synthetic IndexedDB/backup) | NOT RUN | Native File System Access/IndexedDB durability NOT RUN | PASS (automated); native unverified |
| 6 | Repeated preview open/close and unavailable content | PASS (50-cycle image cleanup + race/cleanup tests) | NOT RUN for actual PDF/text preview | Native preview NOT RUN | PASS (automated) |
| 7 | Desktop, narrow, keyboard, mobile | PASS static/unit | PASS desktop and 390×844 emulation; Tab/Shift+Tab/Escape/focus restore | Actual Android/iPhone/Firefox/Safari NOT RUN | PARTIAL (actual mobile unverified) |
| 8 | Local Embed fixture | PASS | PASS local iframe 10 nodes; read-only; search; narrow; no startup notice | External hosting NOT RUN / out of scope | PASS (local demonstration) |
| 9 | Bounded repeated use | n/a | PASS 30 search/clear + 10 Embed open/close | Long soak NOT RUN | PASS (bounded) |

## 4. Defect register

### D-01 — Low — flaky full-suite test under CPU contention (FIXED)
- **Reproduction:** run the full `tests/engine` suite concurrently; the first full audit run failed `copy-map-encoding-main.test.mjs` in `session` mode after 5,410 ms with `AssertionError: deferred encoding started false !== true`.
- **Expected:** the test should wait for the deliberately deferred copy encoding before asserting.
- **Actual:** the fixed 5-second wait expired under heavy parallel load; the child exited 1. Isolated rerun passed.
- **Affected data:** none; test harness only, no application state.
- **Fix:** `tests/engine/exploration/main-harness-init-runner.mjs` copy-encoding branch waits up to 15 seconds and watchdog raised to 40 seconds.
- **Regression:** isolated `copy-map-encoding-main.test.mjs` 4/4 PASS; full suite rerun 1118/1117 PASS, 1 skipped.

### D-02 — Low — superseded r146 production guidance was still readable as current (FIXED)
- **Reproduction:** read `FILEORBIT-STAGE-A-B-r146.md`; the old “production must use sandbox allow-scripts with exact-origin messaging” paragraph remained explicit beneath a general banner.
- **Expected:** readers must see the old production guidance as superseded and use corrected r147 architecture notes.
- **Actual:** banner existed, but the old paragraph still presented itself as instructions.
- **Affected data:** documentation only.
- **Fix:** replaced both old production blocks with explicit `SUPERSEDED BY r147` notes linking to `FILEORBIT-REVIEW-r147.md`.

### D-03 — Low — stale README test count (FIXED)
- **Reproduction:** README reported 1103 tests while the verified baseline is larger and the audit suite is 1118.
- **Expected:** current reported count.
- **Actual:** stale count.
- **Affected data:** documentation only.
- **Fix:** README updated to the final audit count; historical test logs remain unchanged.

**No functional application defects, data loss, corruption, or broken save/reopen were found in the exercised scope.**

## 5. Existing skips and limitations

- One skipped test: `tests/engine/persistence/recovery.test.mjs:276` — “concurrent legacy and recovery writes cannot both pass obsolete totals.” FakeIndexedDB stages overlapping readwrite transactions; **native IndexedDB transaction serialization is NOT RUN**. Concurrent legacy/recovery cap atomicity remains unverified natively.
- No native File System Access picker/write tests were run.
- Android/iPhone/Firefox/Safari native acceptance remains NOT RUN.
- Responsive emulation is not actual mobile acceptance.

## 6. Bounded repeated-use observation

Real Chrome, F20 map:
- 30 search → card → clear cycles: no failures; median 208.5 ms, p95 215.2 ms, max 215.5 ms (deliberate waits included).
- 10 Embed dialog open/Escape cycles: max 60.2 ms; no leaked backdrop.
- Heap (after forced GC): 2,340,480 → 2,872,156 bytes (**+531,676 bytes, ~0.51 MiB**).
- DOM nodes: 715 → 716 (+1); event listeners: 205 → 205; canvas count 1; no runtime exceptions.
- No sustained resource growth apparent within this bounded run. This is not a long-duration soak test.

## 7. Data-safety observations

- Create-limit rejection preserved the loaded F20 map (20 visible/20 total) in browser.
- Automated installer tests preserve old live references on frame/draw failure.
- Failed Open/replacement preservation is covered by P1B main-entry tests.
- Export/import and corrupt/truncated/hash-mismatched packages are covered by backup tests.
- No data-loss or corruption failure occurred in the exercised automated/browser scope.

## 8. Free-edition readiness

**Recommendation: NOT READY for free-edition release or cross-platform acceptance.**

No functional defects were found in the tested local desktop path, and no data loss/corruption occurred. However:
- actual Android/iPhone/Firefox/Safari/Edge acceptance is unverified;
- native File System Access saves, native IndexedDB durability/recovery, actual previews, and native filesystem failure handling are unverified;
- the one skipped native IndexedDB concurrency case remains unverified;
- external Embed remains out of scope and unimplemented.

**Conditional disposition:** suitable for continued local desktop Chrome/Edge experimental evaluation only. Do not present it as a release-ready free edition or mobile-ready product.

## 9. Evidence classes

- **Automated:** Node 24.12.0 tests with synthetic browsers/storage/files.
- **Real browser:** headless Chromium 156, Windows, desktop and 390×844 viewport emulation.
- **Actual device:** NOT RUN for Android/iOS; no evidence.
- **Native desktop picker/write:** NOT RUN.

## 10. Commands and logs

Focused audit:
```powershell
node --test --test-isolation=none tests/engine/exploration/free-edition-audit.test.mjs
node --test --test-isolation=none tests/engine/editor/attachment-viewer.test.mjs
node --test --test-isolation=none tests/engine/exploration/copy-map-encoding-main.test.mjs
```

Create / edit / persistence / navigation groups:
```powershell
node --test --test-isolation=none tests/engine/exploration/create-map.test.mjs tests/engine/exploration/create-map-dialog.test.mjs tests/engine/exploration/create-map-dialog-preparation.test.mjs tests/engine/exploration/create-map-install.test.mjs tests/engine/exploration/create-baseline-main.test.mjs tests/engine/exploration/create-close-gate-main.test.mjs tests/engine/exploration/create-picker-lifecycle-main.test.mjs tests/engine/exploration/directory-selection.test.mjs
node --test --test-isolation=none tests/engine/exploration/reparent.test.mjs tests/engine/exploration/reparent-action.test.mjs tests/engine/editor/e3a-integration.test.mjs tests/engine/editor/e3a-history.test.mjs tests/engine/editor/e3b-history.test.mjs tests/engine/editor/e3a-details-policy.test.mjs tests/engine/editor/draft.test.mjs tests/engine/editor/e2-flow.test.mjs tests/engine/exploration/drag-history-main.test.mjs tests/engine/exploration/drop-controller.test.mjs
node --test --test-isolation=none tests/engine/persistence/backup.test.mjs tests/engine/persistence/persistence.test.mjs tests/engine/persistence/p2-lifecycle.test.mjs tests/engine/persistence/p2-upgrade.test.mjs tests/engine/persistence/recovery.test.mjs tests/engine/persistence/recovery-scheduler.test.mjs tests/engine/exploration/p1b-main.test.mjs tests/engine/exploration/automatic-save-main.test.mjs tests/engine/exploration/recovery-slice2-main.test.mjs tests/engine/exploration/recovery-slice3-main.test.mjs
node --test --test-isolation=none tests/engine/exploration/search.test.mjs tests/engine/exploration/search-activation.test.mjs tests/engine/exploration/search-highlight-main.test.mjs tests/engine/exploration/search-details-main.test.mjs tests/engine/exploration/navigation-model.test.mjs tests/engine/exploration/navigator-integration.test.mjs tests/engine/exploration/folder-navigation-regression.test.mjs tests/engine/exploration/folder-navigation-labels.test.mjs tests/engine/editor/attachment-viewer.test.mjs tests/engine/exploration/yaml-viewer-main.test.mjs tests/engine/exploration/file-open-browser.test.mjs tests/engine/exploration/file-open-browser-stale-main.test.mjs tests/engine/exploration/file-open-navigation-main.test.mjs tests/engine/exploration/resize-lifecycle.test.mjs
```

Full suite:
```powershell
$files = Get-ChildItem tests/engine -Recurse -Filter *.test.mjs | ForEach-Object { $_.FullName }
node --test --test-isolation=none @files
```

Browser fixtures (requires `python -m http.server 8099 --bind 127.0.0.1` and Chrome CDP on 9223):
```powershell
node evidence/native-r121/audit-browser-basic.mjs
node evidence/native-r121/audit-browser-create.mjs
node evidence/native-r121/audit-browser-limits.mjs
node evidence/native-r121/audit-browser-narrow-search-keyboard.mjs
node evidence/native-r121/audit-repeat-use.mjs
```

Results:
- Group totals: create 37/37; edits/history 76/76; persistence 197 (196 pass, 1 skip); navigation/preview 61/61.
- New audit boundaries 3/3; preview repeated-use 11/11 (including 50-cycle test); copy encoding 4/4.
- Full suite: **1118 tests, 1117 passed, 1 skipped, 0 failed** on rerun.
- First full run exposed the fixed D-01 timeout flake; its log is retained.
