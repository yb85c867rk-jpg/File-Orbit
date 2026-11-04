# FileOrbit FULL MAP + ACTIVE SUBTREE prototype

Roadmap B isolated interaction prototype. Not production integration and not paid activation.

## Launch

```powershell
cd C:\Users\openw\Documents\Projects\FileOrbit-git
python -m http.server 8164 --bind 127.0.0.1 --directory .
```

Chrome/Edge: `http://127.0.0.1:8164/tests/harness/large-map/index.html`

## Display policy

Chosen from the authoritative complete-document node count, not the visible projection.

- **<=300:** complete folder/file hierarchy in one map. Free and paid-test maps use the same full-map presentation. Labels are decluttered at fit; nodes are not discarded.
- **>300:** overview of the root/folder hierarchy; first-level categories are labelled and files are suppressed until a category is activated. Flat maps with no folders show root-level files instead of an empty scene.
- **Active category:** the whole overview remains in the graph, dimmed. The selected subtree is relaid out locally in the foreground with its files. Background categories remain clickable.
- **Admission** remains separate: free 300; explicit internal paid-test 1,000. The paid context is an issued policy context, checked with `evaluateContextNodeAccess`.

## Fixtures

- Supplied `20-categories`: full `.orbit` document 246 nodes; display root `map-input` 241 nodes; 20 first-level categories; 122 attachments. Authoritative 246 <=300, so full mode; displayed 241.
- Synthetic 299/300: paid-test full mode.
- Synthetic 301: paid-test overview mode; free context rejected.
- Synthetic 1,000: internal paid-test overview.
- Pure flat 301/1,000: no folders; root-level file exploration.
- Flat/wide/balanced/mixed/deep 300 retained.

## Controls

- Pointer-anchored wheel zoom; background drag pan; + / − / Fit.
- Folder click automatically frames the newly active subtree (zoom in/out).
- Manual wheel/pan cancels an active camera animation.
- Back, root and breadcrumb restore available camera state; otherwise frame the destination.
- Category label boxes are clickable at overview scale.
- Search: previous/next pages, Clear Search clears input and highlight.
- File click selects and previews; it does not expand.
- Preview is tied to current selection/document and is cleared before URL revocation.

## Evidence

- `full-mode-checks.json`: 299/300 full, 301 overview, free-301 rejection, 1,000 overview.
- `active-overview-checks.json`: 20-category full labels, 301 active subtree/background switch.
- `activation-hit-checks.json`: zoom/pan hit target, file selection, background category switch, dense search reveal.
- `ownership-checks.json`: rapid A/B loads, Unload during deferred load, preview selection/clear.
- `pure-flat-clear-checks.json`: pure-flat root files and Clear Search.
- Screenshots: `full-20-categories.png`, `overview-301.png`, `active-301.png`, `overview-1000.png`.

## Known limitations

- Human usability acceptance is pending.
- Full 241-node hierarchy is intentionally dense at Fit; labels are decluttered and detail requires zoom/selection. Category names are readable through the screen-space category labels.
- Active subtree local layout may extend beyond the viewport; background overview remains in the document but is not guaranteed fully on-screen at every zoom.
- No production persistence, Close/Delete, Upload, cloud, Tauri, enterprise or deployment.
- Native picker/disk acceptance NOT RUN.
