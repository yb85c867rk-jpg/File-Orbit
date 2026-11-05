# FileOrbit PC large-map integration candidate

Integration branch `integration/pc-large-map`, derived from work tip `bbf1ff5`. Baseline source remains `fileorbit-stage3j2a-manual-save-r169.zip` (SHA-256 `B3D0D2C2097247E46E1A40F9E668DDF8C448FDB2FC3D8BC36C939621E48CD997`).

## Ownership

The ordinary PC application remains authoritative for the tree, attachment registry, revisions, history, document identity, writable handle, saved baseline, replacement guards, Save/Save As and conflict/recovery.

The integrated large-map presentation is a presentation layer only. It reads the app's live `tree`, calls ordinary details/preview/editor actions, and never creates a second editable document or serializer. Save always serializes the authoritative complete tree.

## Presentation

- Node count is counted from the complete authoritative tree, including root.
- `<=300`: existing PC renderer and full-map interactions.
- `>300`: integrated overview canvas with 20 first-level category labels, active-subtree foreground, dimmed overview, wheel/pan/+/−/Fit, Back/Root/breadcrumb.
- Free admission: 300. `?paidTest=1` explicitly issues the internal paid-test policy context up to 1,000. It is never inferred from file size or count.

## Launch

Free default:

```powershell
cd C:\Users\openw\Documents\Projects\FileOrbit-git
python -m http.server 8164 --bind 127.0.0.1 --directory .
```

`http://127.0.0.1:8164/tests/harness/m5-exploration/index.html`

Explicit internal paid-test mode:

`http://127.0.0.1:8164/tests/harness/m5-exploration/index.html?paidTest=1`

This is a development bootstrap, not production entitlement.

## Fixtures

`tests/fixtures/large-map/`:

- `FileOrbit-20-categories.orbit` — supplied realistic sample; 246 nodes.
- `FileOrbit-300.orbit` — exactly 300 nodes.
- `FileOrbit-301.orbit` — exactly 301 nodes.
- `FileOrbit-1000.orbit` — exactly 1,000 nodes.

300/301/1,000 fixtures have 20 first-level categories, a root-level `README-root.md`, and synthetic TXT/MD/PDF/PNG data with attachments. `generate.mjs` reproduces them.

## Korean user test

1. 무료 모드 실행: 위 기본 URL. 
2. `Open Orbit → Orbit File`로 20-category와 300-node `.orbit` 열기. 20-category는 전체 지도, 300-node는 기존 무료 전체 지도.
3. 같은 무료 화면에서 301-node 파일을 열면 300-node 제한으로 거부되고 기존 문서가 유지되는지 확인.
4. 유료 테스트 모드: `?paidTest=1` URL로 새로 열기. `Open Orbit → Orbit File`로 301과 1,000-node 열기.
5. 카테고리 클릭 → 활성 하위 트리가 밝게, 전체 카테고리 개요는 어둡게 유지. 배경 카테고리 클릭으로 전환.
6. 휠 확대/축소, 배경 드래그, `+`/`−`/`Fit`, `←`/`⌂`/브레드크럼.
7. 검색에서 `README-root.md`(루트 파일)와 하위 PDF를 찾아 선택/미리보기.
8. 파일 클릭은 선택만, 더블클릭은 미리보기. 우클릭 `Edit Data`/`Delete Data` 메뉴.
9. 파일 편집 후 Undo/Redo, Save As, 재열기.
10. 1,000-node에서 Save As 후 다시 열어 노드/첨부가 유지되는지 확인.

## Validation evidence

- `integration-free-capacity.json`: free 300 open + free 301 rejection preserving 300.
- `integration-paid-large.json`: paid 301/1,000 custom presentation.
- `integration-search-active.json`: category activation and root-level search reveal.
- `integration-saveas.json` + `integration-saveas-decode.json`: 1,000-node Save As, 1,000 IDs/topology/attachments preserved.
- `integration-editor-preview.json`: editor menu and PDF preview.
- `integration-replacement.json`: paid 300 existing renderer → 1,000 custom → 300 existing.
- `integration-20-category.json`: realistic 246-node open.
- `integration-focused-tests.txt`: 5/5.
- `integration-p1b-tests.txt`: existing PC main regression.

Screenshots: `integrated-300.png`, `integrated-1000.png`, `integrated-1000-active.png`.

## Limitations / NOT RUN

- Native OS picker/disk acceptance NOT RUN; automated picker/file input stubs used.
- Human usability acceptance pending.
- Integrated editor entry menu and preview were executed; a full integrated rename → Undo/Redo round-trip was not separately executed.
- Automatic camera framing and manual animation cancellation were implemented; not all camera animation edge cases were independently re-executed in the ordinary app.
- The hidden base canvas remains mounted during >300 presentation for mode switching; only one graph workspace is visible.
- No Close/Delete, Upload, cloud, payments, Tauri, enterprise or deployment.


## Correction pass

- Editor admission now uses the explicit policy context through canEdit, command construction, history replay and reparent paths. Free 300 remains editable; free 301 rejected; paid-test 1000 editable; a 1001st child is rejected before commit.
- Large presentation uses dataset identity plus root/count/topology signature. Metadata-only edits keep layout/camera; structural edits rebuild layout; document replacement resets presentation state.
- Selection/search synchronization is explicit: null selection clears, empty search target clears forced reveal/styling, PDF fill remains red and search uses a blue stroke.
- Top-toolbar Fit routes to the active presentation; the duplicate local Fit was removed; breadcrumb ancestors are clickable.
- Custom navigation is gated by the app's editor/save/replacement/delete/preview ownership checks.
- Presentation frame loop is cancelled and observers/listeners are removed on destroy.

Retained check: `tests/harness/m5-exploration/integration-checks/paid-edit-check.mjs`.
Retained admission test: `tests/harness/large-map/admission.test.mjs`.
## Correction validation summary

- Paid-test 1,000 edit executed through the ordinary editor: name/description applied, form closed, Save As wrote 1,000-node package, tree and presentation names agreed, Undo removed the rename and Redo restored it.
- `admission.test.mjs`: free 300 rename allowed; free 301 rejected; paid 1,000 rename allowed; paid 1,000 + 1 child rejected.
- Final focused: 5/5 PASS; final P1B: 69/69 PASS.
- Final UI: 300 uses existing renderer, 1,000 uses integrated presentation with 20 categories; top `#fit` exists; breadcrumb has 2 ancestor buttons after category activation.
- Frame loop and observer are explicitly cancelled/disconnected on destroy.

## Navigation correction pass

- Breadcrumb listeners now use a shared lexical `navigateTo` before dispatch, so ancestor clicks resolve to canonical folder nodes instead of throwing.
- Category label hit boxes resolve to the canonical scene node; label and dot activation both expand folders.
- Back, Root, breadcrumb, Fit, zoom buttons, wheel and pan now pass through `canInteract`; a blocked action does not mutate focus, selection, history or camera.
- Dataset replacement and structural layout changes cancel old framing animation and drag state.
- Search path edges use `#60A5FA` at 0.55 opacity; matching folder outlines and the active result outline use `#60A5FA` with explicit precedence. PDF fill, filename and badge remain `#F87171`; file fill remains green.
- Renderer frame scheduling is tracked and cancelled on destroy; observers and DOM are removed.
- Fixtures 301/1000 now include one nested folder for breadcrumb testing while retaining exact counts.

Executed in this pass:

- label click after Fit expanded `cat-1` with 50 active nodes;
- top-toolbar Fit changed the active camera;
- PDF paint/label color asserted `#F87171`;
- renderer lifecycle exposed a live frame handle; destroy cancellation is code-reviewed and unit-verified only indirectly.

Executed: middle-breadcrumb click and dirty-editor blocked Back/Root. Not executed: replacement during animation, search-path pixel/clear assertions, disposal frame-count assertion.


## Final focused verification

- Structural topology change now cancels stale animation/drag before layout rebuild while preserving focus/camera. The structural/replacement animation assertions are NOT RUN.
- `activateSearchResult` routes admitted large maps directly to the active presentation after stale-result, ownership and dirty-editor checks. Actual app search results verified:
  - `README-root.md` → focus root, selected root-file, Details agrees, scene 23;
  - `01_기획` → focus cat-1, selected cat-1, Details folder;
  - `하위-폴더` → focus nested-1, selected nested-1;
  - `중첩-문서.txt` → focus nested-1, selected nested-file-1, Details agrees.
- Blocked dirty-editor Back/Root executed: focus remained cat-1, selection nested-file-1, history 1, camera unchanged, status explained the block.
- P1B suite initially reported one transient failure in “Import Backup first Save…”. The failing scenario passed standalone; the full suite then passed 69/69. The original failure and result are recorded honestly.
- Middle breadcrumb click is retained and passing.
- Structural/replacement animation assertions, search-path pixels/clear, disposal frame-count, same-count topology and pure-flat navigation remain NOT RUN. The complete current-handle save/reopen and Save As cancellation sequences are executed below.

## Complete save/reopen verification

Executed through the ordinary app editor and toolbar buttons, using deterministic writable handles:

- opened paid-test 1,000 through the writable test adapter;
- edited a nested file name to `Saved-Reopen-1000.txt` and description to `save reopen verified`;
- the editor Save wrote through the current handle;
- clicked actual toolbar `#undo-history`; original `중첩-문서.txt` returned; history undo 0/redo 1;
- clicked actual toolbar `#redo-history`; edited name returned; history undo 1/redo 0;
- saved through the existing `saveCurrentDocument` path (programmatic invocation; no visible Save control);
- reopened the written bytes through the writable import/open pipeline;
- reopened: 1,000 nodes, IDs equal, topology equal, edited name/description, graph and Details `Saved-Reopen-1000.txt`, attachment hashes unchanged, writable identity `saved-1000.orbit`, savedRevision 0 and dirty false.

Save As cancellation was also executed with an `AbortError` picker: destination bytes hash unchanged, handle identity unchanged, zero writes, dirty state retained.

Deterministic handles are not native OS/disk acceptance.


