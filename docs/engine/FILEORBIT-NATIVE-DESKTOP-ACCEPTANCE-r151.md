# Native desktop acceptance — r151 headed-browser observation

## Environment
- OS: Microsoft Windows NT 10.0.26300.0 (Windows 11 family)
- Browser: **headed Google Chrome 156.0.8078.76**
- Origin: `http://127.0.0.1:8099`
- Dedicated profile: `.browser-prof-r151-headed`
- Disposable native fixtures: `evidence/native-r121/r151-native-fixtures/`
- No user files were written or overwritten. The unrelated Picture-in-Picture window visible on the desktop was not interacted with.

## What was actually observed
- The headed FileOrbit window was visible.
- Native Windows file dialogs were visible:
  - `Select Folder to Upload`
  - native `Open` multi-file dialog
  - Chrome file-access warning + native Save dialog
- Through the native Open dialog, **299 flat files** were selected from `selection-299`.
- The application preview then reported: **0 folders, 299 files, 6,171 bytes**.
- Candidate total: **1 synthetic root + 299 selected files = 300 nodes**. This is the application’s actual candidate count, not an assumed count.

Evidence screenshots:
- [Headed FileOrbit window](../../evidence/native-r121/r151-headed-window.png)
- [Native folder dialog](../../evidence/native-r121/r151-folder-dialog-3.png)
- [Native Create Map preview with 299 files](../../evidence/native-r121/r151-create-300.png)
- [Native Save dialog reached](../../evidence/native-r121/r151-save-dialog.png)

## Native workflow results

| Workflow | Result | Detail |
|---|---|---|
| Visible headed browser | **PASS** | FileOrbit visible in dedicated Chrome |
| Native folder/file picker visibility | **PASS** | dialogs observed |
| Native 299-file selection and 300-node candidate preview | **PASS** | 0 folders + 299 files + synthetic root = 300 |
| Create Map commit through native Save As | **NOT RUN** | native Save dialog reached; commit was not completed in this desktop automation session |
| Cancel Create Map at destination picker with a previous document | **NOT RUN** | no previous document was present; preservation not verified |
| Save As success | **NOT RUN** | not completed |
| Native Open of saved `.orbit` | **NOT RUN** | not completed |
| Save As cancellation preserving identity/dirty/destination | **NOT RUN** | not completed |
| External destination modification and overwrite conflict | **NOT RUN** | not completed |
| Native 301 rejection with committed 300 map/file intact | **NOT RUN** | not completed |
| Browser restart native persistence/recovery | **NOT RUN** | not completed |

Focused r151 attachment-viewer/feedback checks: **12/12 PASS**. No application behavior changed; the r149 serial full suite remains **1119 tests, 1118 passed, 1 skipped, 0 failed**. No application defect was inferred from the incomplete Save interaction. The Save dialog was visible; its native confirmation was not completed. Downloads, injected handles, and harness-assisted imports were not used as native evidence.

## Concise user-assisted checklist

1. Open FileOrbit in headed Chrome/Edge with a dedicated disposable profile at `http://127.0.0.1:8099`.
2. Create Map → native Open → select the **299 files** in `evidence/native-r121/r151-native-fixtures/selection-299` (flat folder). Confirm the app preview says `0 folders, 299 files`; total candidate count is **300 including the synthetic root**.
3. Enter a title → Create Map → native Save As → save as `native-300.orbit` in a disposable folder. Record the exact filename and SHA-256. This is the actual Create Map commit.
4. Repeat with `selection-300` (300 files): total is **301** and must reject with the 300-node map and saved file unchanged.
5. With the committed map open, Save As → cancel. Verify document name, dirty state, and destination bytes are unchanged.
6. Native Open the saved `native-300.orbit`; compare node IDs, topology, metadata, and attachment SHA-256 values.
7. Modify the saved destination externally, then attempt Save/overwrite; verify conflict protection and cancellation preserve the current document.
8. Restart the browser with the same profile; verify only the documented persisted/recovery behavior. Do not call an unsaved-state warning “recovery.”
9. Record browser/OS versions, origin, profile path, exact actions, file hashes, screenshots, and PASS/FAIL/NOT RUN.

## Remaining blockers
- Native Create Map commit and Save As completion.
- Native Open, cancellation, overwrite conflict, 301 preservation, and restart.
- Headed Edge, Firefox, Safari, Android, iPhone/iPad.
- Native filesystem failure/quota and multi-tab contention.

**Free-edition readiness remains NOT ACCEPTED.** The native candidate count was verified at 300, but the native commit/save/open/conflict matrix remains NOT RUN.
