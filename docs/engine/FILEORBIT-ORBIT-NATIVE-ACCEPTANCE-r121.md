# FileOrbit Orbit Slice 6 — native acceptance report

Status: **PARTIAL / BLOCKED**. Native picker/filesystem acceptance was not executable in this environment. No Slice 6 acceptance is claimed. Slice 5’s bounded automated review is accepted.

## 0. User-reported PC manual acceptance

The user reports that all functions tested on their PC work correctly. This is recorded as **user-reported manual acceptance**, not independent verification. The report did not include a browser/version, screenshots, hashes, or a per-scenario log. It does not establish Android, iPhone, Firefox, or Safari acceptance. See [user-reported-pc-acceptance.md](../../evidence/native-r121/user-reported-pc-acceptance.md).

## 1. Environment and baseline

| Item | Value |
|---|---|
| Execution date | 2026-10-31 19:50 +13:00 |
| OS | Windows NT 10.0.26300.0, x64 |
| Active browser | Microsoft Edge 156.0.4314.50, `HeadlessChrome/156.0.0.0` |
| Installed Chrome | 156.0.8078.48 |
| Application URL | `http://127.0.0.1:8099/tests/harness/m5-exploration/` |
| Reviewed baseline | r120 archive `935B871B8C0478596FC365E1A6BDE700B150CE659DA29597ABD4BFFF8696D9B8` |
| Test workspace | `evidence/native-r121/FileOrbit-Native-Acceptance` |

### Source and server verification

- Served application returned HTTP 200; `index.html` was 47,535 bytes.
- Served/on-disk source hashes matched:
  - `index.html`: `64A02389C475076C34F2013A8FC1EF6AA70E07A448EF72BB1272F2DA10203834`
  - `main.mjs`: `9BE40D6BE5EFB1A69159FD37CD1F1BC08EC46E543D8DE3EBD06073E1D2ADD5C6`
- The same hashes match the r120 review archive.
- A fresh browser context initialized with the expected FileOrbit title and controls. No horizontal overflow was observed at desktop width or 390 px.

HTTP 200 and API presence are not native picker/write evidence.

## 2. Native boundary

The available Chromium target was a headless Edge CDP session. Heading Chrome and Edge launches with dedicated profiles and separate debugging ports did not leave a debuggable window. As a result:

- no native directory picker could be displayed;
- no native file picker could be displayed;
- no real File System Access handle could be created;
- no native write/close/permission behavior could be observed.

`showDirectoryPicker`, `showOpenFilePicker`, and `showSaveFilePicker` exist as functions in the page, but this is not evidence that a native picker or successful write occurred. No fake handles or injected file inputs were substituted.

## 3. Prepared disposable workspace

Location: `evidence/native-r121/FileOrbit-Native-Acceptance`

Fixtures:

- `Orbit Parent/Existing Orbit/populated.map` — synthetic map with `brief.pdf` and `notes.yaml` attachments;
- `Orbit Parent/Existing Orbit/zero.map` — 0-byte existing file;
- `Orbit Parent/Existing Orbit/invalid.map` — 32-byte invalid package;
- `Standalone/standalone.map` — valid standalone map;
- `Standalone/legacy.fileorbit` — identical bytes under the legacy extension;
- `Standalone/external-changed.map` — a second valid package for external-change scenarios;
- `Orbit Parent/Existing Orbit/notes.txt` — top-level non-map filter check;
- `Orbit Parent` — parent for Create Orbit.

Hashes are recorded in `fixtures.json` and `fixture-manifest.sha256` (9 fixture files). Fixtures are disposable and outside original user documents/imported folders.

## 4. Native acceptance matrix

| ID | Scenario | Status | Evidence / reason |
|---|---|---|---|
| A1 | Open existing Orbit through native picker | BLOCKED | No native picker; headless browser |
| A2 | Only top-level `.map` files listed | BLOCKED | Requires native Orbit open |
| A3 | Refresh after external add/remove | BLOCKED | Requires native handle |
| A4 | Cancel another Orbit selection; preserve current | BLOCKED | Native picker unavailable |
| A5 | Close Orbit; live document remains | BLOCKED | Requires native Orbit |
| B1 | Create named Orbit in disposable parent | BLOCKED | Parent picker unavailable |
| B2 | Verify real directory exists | BLOCKED | Not created through native UI |
| B3 | Create title-only map; no per-map picker | BLOCKED | No native Orbit handle |
| B4 | Verify `.map` exists and reopens as one root | BLOCKED | No native write/reopen |
| B5 | Create populated map | BLOCKED | No native UI |
| B6 | Reopen and view PDF/YAML | BLOCKED | No native reopen |
| C1 | Duplicate filename collision | BLOCKED | No native save |
| C2 | Case-equivalent collision | BLOCKED | No native save |
| C3 | Existing zero-byte collision | BLOCKED | No native save |
| C4 | Hash unchanged; alternate name/cancel possible | BLOCKED | No native save |
| D1 | Edit Orbit map and protected Save | BLOCKED | No native handle |
| D2 | Reopen actual file and verify edit/attachments | BLOCKED | No native reopen |
| D3 | External modification + Save conflict | BLOCKED | No native external write |
| D4 | Cancel preserves external file and local edits | BLOCKED | Native conflict UI unavailable |
| D5 | Explicit overwrite after confirmation | BLOCKED | Native conflict UI unavailable |
| D6 | Save a Copy separate destination | BLOCKED | Native Save As unavailable |
| D7 | Original destination through Save a Copy rejected | BLOCKED | Native Save As unavailable |
| D8 | Save As outside Orbit + subsequent protected Save | BLOCKED | Native Save As unavailable |
| E1 | Standalone map + committed unsaved edit | BLOCKED | Native Open required |
| E2 | Add to Orbit copy has edit + exact attachments | BLOCKED | Native Orbit write required |
| E3 | Original hash/destination/dirty unchanged | BLOCKED | Native copy unavailable |
| E4 | Copy not automatically opened | BLOCKED | Native copy unavailable |
| E5 | Duplicate copy name rejected | BLOCKED | Native copy unavailable |
| F1 | Editor Save uses established destination | BLOCKED | Requires native document |
| F2 | Dirty replacement Cancel preserves outgoing map | BLOCKED | Native Open required |
| F3 | Save and continue completes before replacement | BLOCKED | Native Open required |
| F4 | Recover unsaved map; explicitly save/copy into Orbit | BLOCKED | Native Orbit required |
| F5 | Recovery separate from document file | BLOCKED | Requires native document |
| F6 | Reload requires Orbit reauthorization | BLOCKED | No native Orbit to reload |
| G1 | Desktop layout: 1414×773; no horizontal overflow | PARTIAL PASS | Browser-rendered screenshot; headless UI |
| G2 | Narrow 390×844; no horizontal overflow | PARTIAL PASS | Browser-rendered screenshot; headless UI |
| G3 | Rail expand / Details collapse / theme | PARTIAL PASS | Actual browser UI via CDP; screenshots |
| G4 | Editor drafts, tooltips, keyboard focus, scrolling, fullscreen | NOT RUN | Requires native document interaction |
| G5 | Node reparent + Undo/Redo; camera pan distinction | NOT RUN | Requires native map editing |

Native filesystem scenarios are **BLOCKED**, not PASS. Browser layout results are not native filesystem acceptance.

## 5. Platform results

| Platform | Result |
|---|---|
| PC Windows / Chromium | Source/server PASS; browser initialization PASS; native picker/write BLOCKED |
| Android | NOT RUN — no device/ADB configured; no network exposure changes attempted |
| iPhone | NOT RUN — no device configured; no network exposure changes attempted |
| Firefox/Safari | NOT RUN |

No unsupported environment is presented as having Orbit write access. No mobile test was inferred from the PC browser.

## 6. Evidence inventory

- `evidence/native-r121/native-acceptance.json`
- `evidence/native-r121/browser-evidence-clean.json`
- `evidence/native-r121/browser-layout.json`
- `evidence/native-r121/browser-desktop-clean.png`
- `evidence/native-r121/browser-narrow-clean.png`
- `evidence/native-r121/browser-choice-clean.png`
- `evidence/native-r121/browser-rail-expanded.png`
- `evidence/native-r121/browser-details-collapsed.png`
- `evidence/native-r121/browser-theme.png`
- `evidence/native-r121/FileOrbit-Native-Acceptance/fixtures.json`
- `evidence/native-r121/fixture-manifest.sha256`

Separate categories:

1. **Real UI + native picker/filesystem:** none — blocked.
2. **Browser layout evidence:** desktop, narrow, choice, rail, details, theme screenshots; headless Edge.
3. **Synthetic-handle automated tests:** Slice 1–5 suites; not native acceptance.
4. **User-reported manual results:** none.

## 7. Defects and limitations

No native-execution defect was observed because native interaction did not occur. There is no evidence to confirm or deny native permission, save, conflict, or recovery behavior.

Preserved limitations:

- preflight-to-write race;
- empty/partial leftovers after failed creation;
- no automatic cleanup;
- stale Open Orbit selection may remain in the controller;
- no persisted Orbit handle;
- no watching, recursion, rename/delete, or synchronization.

Do not claim crash durability, atomic creation, exclusive creation, compare-and-write, or rollback.

## 8. Next step

A headed Chromium session with native picker access is required to execute the checklist and replace BLOCKED rows with observed PASS/FAIL results. Use the browser reload icon for reloads; use only the reload icon.
