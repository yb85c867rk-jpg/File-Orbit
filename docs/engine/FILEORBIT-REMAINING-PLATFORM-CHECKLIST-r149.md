# Remaining platform checklist — r149

## Observed
- [x] Windows headless Chromium 156.0.8078.76, origin `http://127.0.0.1:8099`
- [x] 300-node import/save/reopen/recovery in dedicated profile
- [x] Native IndexedDB concurrency, abort, reopen, browser restart
- [x] Disk `.orbit` download and byte comparison
- [x] PDF/Markdown/text/image previews and unavailable feedback

## NOT RUN — manual / native
- [ ] Headed Chrome/Edge desktop, native Create Map save picker
- [ ] Native Save As, picker cancellation, native overwrite protection
- [ ] Native Open File/Open Orbit picker
- [ ] Firefox
- [ ] Safari
- [ ] Android Chrome on device/emulator
- [ ] iPhone/iPad Safari browser/PWA
- [ ] Native quota/full-disk/write failure
- [ ] Concurrent multi-tab native storage contention
- [ ] Long-duration soak/resource/thermal behavior

## Manual native picker steps (leave NOT RUN until observed)
1. Serve the project at `http://127.0.0.1:8099` and open in a headed desktop browser with a dedicated profile.
2. Use Open File → Open file elsewhere, select a downloaded `R149 300 Node Map.orbit`; record node count and attachment previews.
3. Use Save As, choose a disposable test folder, confirm write and close; cancel a second Save As and verify the current document remains unchanged.
4. Use Create Map with a disposable 299-file/299-node folder selection, save to a disposable folder, then add one file to produce 301 and verify rejection preserves the committed map.
5. Repeat previews and recovery steps; record browser/OS version, origin, profile path, file hashes, and screenshots.
6. Do not mark any row PASS without direct observation; do not substitute synthetic picker behavior.

## Later mobile step
Actual Android/iOS acceptance remains separate and is not implied by the 1600×1000 or narrow viewport emulation.
