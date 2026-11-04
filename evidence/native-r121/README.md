# FileOrbit Orbit Slice 6 — native acceptance evidence

Status: **PARTIAL / NATIVE PICKER AND FILESYSTEM ACCEPTANCE BLOCKED**
No Slice 6 acceptance is claimed.

## Environment

- OS: Windows NT 10.0.26300.0 (x64)
- Executed: 2026-10-31 19:50 +13:00
- Active browser: Microsoft Edge 156.0.4314.50, `HeadlessChrome/156.0.0.0`
- Installed Chrome: 156.0.8078.48
- Application URL: `http://127.0.0.1:8099/tests/harness/m5-exploration/`
- Baseline: r120 archive `935B871B8C0478596FC365E1A6BDE700B150CE659DA29597ABD4BFFF8696D9B8`

## Source/server verification

- HTTP 200, `index.html` 47,535 bytes.
- Served and on-disk hashes match:
  - index: `64A02389C475076C34F2013A8FC1EF6AA70E07A448EF72BB1272F2DA10203834`
  - main: `9BE40D6BE5EFB1A69159FD37CD1F1BC08EC46E543D8DE3EBD06073E1D2ADD5C6`
- Served source also matches the r120 archive.
- Fresh browser context initialized with the expected title, Create/Open/Save controls, Orbit action/panel, and no horizontal overflow at desktop or 390 px.

## Native boundary

The only available Chromium target was a headless Edge CDP session. Headed Chrome and Edge launches with dedicated profiles did not leave a debuggable window. Therefore no native directory/file picker could be displayed or operated. No picker result is inferred from API availability, API-injected handles, or browser screenshots.

## Fixtures

Prepared under `evidence/native-r121/FileOrbit-Native-Acceptance`:

- titled populated map with PDF + YAML;
- standalone `.map`;
- legacy `.fileorbit`;
- zero-byte `.map`;
- invalid `.map`;
- `Orbit Parent` for Create Orbit;
- unrelated `notes.txt` to verify top-level filtering.

Hashes and paths: `fixtures.json` and `fixture-manifest.sha256`.

## Results

All native filesystem scenarios A–F are **BLOCKED**. Browser-only layout evidence is **PARTIAL/PASS** for desktop, 390 px narrow, rail expansion, Details collapse, and theme. Editor drafts, node reparent Undo/Redo, fullscreen, tooltips, and real native scrolling were **NOT RUN**.

PC native: **BLOCKED**. Android/iPhone/Firefox/Safari: **NOT RUN**.

See `native-acceptance.json`, screenshots, and `docs/engine/FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md`.

## r122 navigation refinement

The subsequent navigation refinement removed the primary rail Save/Open Orbit actions, unified **Open File** with **Open Orbit / Open map file / Cancel**, and added Settings **Save changes**. User-reported PC manual testing passed but is not independent verification. See `r122-navigation.json` and `docs/engine/FILEORBIT-NAVIGATION-REFINEMENT-r122.md`.

No native picker/write behavior was verified in this environment.
