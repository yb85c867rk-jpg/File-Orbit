# Android/iOS remaining checklist — r151

Status: **NOT RUN**. No Android device/emulator or iPhone/iPad was available. Viewport emulation is not mobile acceptance.

## Android Chrome
- [ ] Open `http://<test-host>:8099/tests/harness/m5-exploration/` on a dedicated Android Chrome profile.
- [ ] Create Map from a disposable folder; confirm the application candidate count including synthetic root and selected folder nodes.
- [ ] Commit 300 total nodes, save via native Android document provider, and record filename/SHA-256.
- [ ] Cancel Save and verify document identity/dirty state.
- [ ] Native Open the saved `.orbit`; compare node IDs, topology, metadata, attachment hashes.
- [ ] External destination modification and overwrite-conflict behavior.
- [ ] 301 candidate rejection with the committed map/file unchanged.
- [ ] Browser/app restart and documented recovery behavior.
- [ ] PDF/text/image previews; PDF content/page navigation; unavailable-content feedback.
- [ ] File picker cancellation and unsupported-provider behavior.

## iPhone/iPad Safari (browser and installed PWA)
- [ ] Open FileOrbit from a test host on iOS Safari/PWA with a dedicated profile.
- [ ] Create Map/import selection; count synthetic root and selected folders.
- [ ] Save/export `.orbit` through the iOS document/share flow; record exact filename and hashes.
- [ ] Cancel save/share and verify the current document remains.
- [ ] Reopen `.orbit` via Files/document picker; compare structure, metadata, attachment bytes.
- [ ] 301 rejection with the existing map/file unchanged.
- [ ] Tab/app termination/restart and documented recovery behavior.
- [ ] PDF preview (in-app and external), page navigation, close/reopen; text/Markdown/image content.
- [ ] Unsupported/embedded-content fallback messaging.

## Evidence requirements
Record device model, OS/browser version, origin, profile state, exact actions, file hashes, screenshots, and PASS/FAIL/NOT RUN per row. Do not infer mobile results from desktop viewport emulation.
