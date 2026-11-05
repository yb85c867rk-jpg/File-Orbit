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



## Per-node attachment binding verification

The 1,000-node fixture now contains two files named `same-name.txt` in different folders with different bytes. The save/reopen test resolves attachment content through each node's `data.attachmentId`, not by original filename.

Verified before save and after reopen:

- every attachment-bearing node resolves to a runtime attachment registry entry;
- missing references fail the test;
- the two same-named nodes retain distinct references and distinct SHA-256 hashes;
- attachment names, sizes, MIME metadata and hashes match per node;
- document IDs and topology remain equal;
- runtime attachment IDs may remap; IDs are not treated as stable storage identifiers.

## Automatic-save cancellation verification

Save As cancellation now uses the existing `__M5_DISABLE_AUTOMATIC_SAVE__` test override:

- a real editor metadata edit is saved through the writable handle;
- automatic saving is disabled;
- toolbar Undo restores the prior content; dirty becomes true naturally, with no `touch()`;
- instrumented handle writes remain unchanged across Undo and cancellation;
- Save As invokes the picker once and throws AbortError;
- destination hash before and after cancellation is equal;
- handle object and dirty state are unchanged.

Separate ordinary-Undo-with-automatic-save-enabled behavior was attempted but the automatic save did not make the state clean within the observation window; that separate assertion is NOT RUN.

## Automatic Undo/Redo saving

Fresh session, automatic saving enabled from startup, deterministic writable handle:

- editor metadata edit wrote with write count 1, savedRevision 1;
- toolbar Undo wrote undone content with write count 2, savedRevision 2;
- decoded written bytes contained `중첩-문서.txt`;
- dirty became false only after the write, with no automatic-save failure/block;
- toolbar Redo wrote edited content with write count 3, savedRevision 3;
- decoded written bytes contained `Auto-Save-1000.txt`;
- dirty false after write completion.

### Cause of the earlier dirty observation

The earlier Save As cancellation test left `automaticSaveBlocked=true` with no failure object. The document had `dataRevision=3`, `savedRevision=1`, dirty true, and writes remained 1. Removing only the `__M5_DISABLE_AUTOMATIC_SAVE__` flag does not clear `automaticSaveBlocked`, so Redo remained dirty.

This is intentional cancellation protection: automatic saving does not resume merely because a test flag is removed. Recovery requires an explicit manual Save/Save As, which clears the block at the start of `saveCurrentDocument`, or a deliberate retry/reload. No application defect was found; the earlier re-enabled test was invalid because it bypassed the required recovery action.

## Followable folder expansion (human feedback correction)

The custom large-map presentation now transitions geometry and camera together using a configurable **750 ms** duration and **easeInOutCubic** easing. Reduced-motion preference shortens this to **120 ms**. `setTransitionDuration(ms)` is retained for usability tuning.

- Folder activation captures the currently displayed scene, changes focus, computes the destination layout, and interpolates node positions, edges, labels, selection indicators and camera from that intermediate state.
- Newly appearing nodes spawn from the clicked folder, fade in with a short per-node stagger, and old background context fades out rather than disappearing abruptly.
- The clicked folder keeps an amber selection ring and label throughout the transition.
- Camera framing is calculated from the usable graph viewport (toolbar, navigation and Details insets measured when they overlap) and actual expanded bounds. Small branches zoom in; a larger branch is fitted with a lower scale.
- Wheel/pan/explicit camera actions freeze the displayed intermediate geometry and cancel camera motion; they do not jump to the destination later.
- Repeated clicks retarget from the current intermediate frame.
- Back, Root, breadcrumb and background-category navigation use the same transition path; Back restores its stored camera.
- Replacement and structural refresh clear geometry/camera transitions.

### Final animation corrections

- Stagger progress is normalized so every new node reaches opacity/position 1 at the endpoint; no endpoint snap.
- Completion clears geometry, paints the final base scene, updates labels/hit targets, then marks animation complete.
- Active subtree and dimmed global folder overview use separate presentation transforms within the same workspace: global folders use the overview camera, active nodes use the active camera, and hit testing follows the layer.
- Initial viewport is measured before the initial camera; the previous 0.08 placeholder result is gone (initial scale 0.739).

### Executed transition results

- measured overview scale **0.739** → category **1.016** (zoom in; initial scale no longer comes from a placeholder viewport);
- nested branch **2.4** (closer);

- background category focus `cat-2`, Back restored `nested-1`, middle breadcrumb restored `cat-1`, Root restored `root`;
- wheel and pan interruption froze world geometry and left no delayed jump;
- endpoint test: at 749 ms geometry still active, minimum late-node opacity **1.0**, maximum position distance to final **0 px**; at 750 ms anim=false, geom=false, final sample pixel green [34,197,94,255];
- all 22 folders visible after category framing; direct larger/background click from nested to cat-2 zoomed out to **1.043**, then Back restored nested.
- repeated cat-1 → cat-2 clicks ended on `cat-2`;
- document replacement cleared `anim` and `geom`;
- reduced-motion duration **120 ms**;
- label hit target resolved to `cat-1` while moving; no browser errors.

Intermediate frames and GIF: `transition-frame-00.png` through `transition-frame-05.png`, `transition-cat1.gif`.

The 300-node document remains on the ordinary renderer (`custom=false`, count 300); screenshot `transition-300-regression.png`.

These are machine checks, not the human animation usability verdict.






## Readable active nodes, peripheral context and top breadcrumb

- Active immediate children receive default 11px filename labels, not only selected nodes.
- Labels use screen-space collision placement with leader lines, viewport clamping and extension-preserving truncation; full path is exposed as the canvas tooltip.
- PDF labels remain `#F87171`.
- The focused folder is selected and retains its label after completion.
- Dimmed context consists only of root and first-level category folders in a peripheral band; unrelated background edges/descendants are not painted in the central active area.
- Background/context labels and nodes remain directly clickable; faded nodes below the opacity threshold do not receive hits.
- A dedicated full-width breadcrumb row sits below the top toolbar with `aria-current="page"`, native buttons, separators, keyboard activation and horizontal scrolling for long paths.
- Current hierarchy comes from the actual path, not click history. Back remains a secondary history action.

Executed label metrics:

- 1600px test: 50/50 immediate children labeled; overlap 0; outside viewport 0; central background nodes 0; PDF color red;
- 1900×870 `12_고객지원`: 49/49 immediate labels; overlap 0; outside 0;
- 1280×800 `12_고객지원`: 49/49 immediate labels; overlap 0; outside 0.
- Breadcrumb at nested: `20개 카테고리 지도 / 01_기획 / 하위-폴더`, current `하위-폴더`; activating `01_기획` restored `cat-1` and current marker.

Screenshots:

- `readability-1900-overview.png`
- `readability-1900-active-12.png`
- `readability-1900-nested.png`
- `readability-1900-breadcrumb-return.png`
- `readability-1280-active-12.png`
- `transition-cat1.gif` (fresh 1900px recording)

## Internal Hypertree renderer comparison

Production free admission remains 300. The internal comparison mode is explicit and paid-test-only for >300:

- custom reference: `http://127.0.0.1:8164/tests/harness/m5-exploration/index.html?paidTest=1`
- free-app Hypertree comparison: `http://127.0.0.1:8164/tests/harness/m5-exploration/index.html?paidTest=1&hypertreeCompare=1`
- free production URL: `http://127.0.0.1:8164/tests/harness/m5-exploration/index.html` (301 remains rejected)

`hypertreeCompare=1` bypasses only the custom presentation mount. Admission still uses the paid-test policy context, the same `.orbit` bytes go through the protected import pipeline, and the ordinary base Hypertree layout/navigation path is used. A visible renderer badge identifies `Custom large-map renderer`, `Hypertree comparison · free-app renderer`, or the standard renderer.

Executed comparison results:

- custom 1,000: SHA-256 matches fixture; authoritative count 1,000; focus `cat-12` after category click;
- comparison base: 1,000-byte SHA matches the same fixture before layout;
- base 300 loads and reports count 300, focus root, renderer `base`;
- requesting the identical 1,000 bytes in comparison base fails with `experimental-v2-infeasible`:
  - parent `cat-1`: required angular clearance **0.561**, available **0.320** at `workspaceScale` **16**;
  - 61 layout candidates attempted;
- current 300 document preserved: count 300, focus root, name `FileOrbit-300.orbit`;
- renderer badges distinct; initial focus root matches.

## Existing-Hypertree 1,000-node capacity experiment (evaluation branch)

Branch: `eval/hypertree-1000-capacity`.

Launch experiment:

`http://127.0.0.1:8164/tests/harness/m5-exploration/index.html?paidTest=1&hypertreeCompare=1&hypertreeProjectionRadius=480`

The base/free-app path receives the same fixture and keeps the full tree; no custom radial presentation is mounted. `hypertreeProjectionRadius=480` changes the existing layout's reference projection radius only, not the workspace scale maximum or admission.

Trace at baseline (`R240`):

- root has a `2π` angle span and allocates `cat-1` **0.320349** of it;
- `cat-1` immediate children require **0.561221** at workspaceScale 16;
- required child arc uses `2 * asin((2*glyphRadius + clearance) / (2 * rho * referenceProjectionRadius * workspaceScale))`;
- branch/demand changes (`demandCompression=1`, `branchWeight=10`, `bandCount=4`, `radialFlex=1`) remained infeasible at `cat-1`; the shortfall is structural, not just a bad demand weight;
- `referenceProjectionRadiusCss=480` makes staging feasible (scale 14.25 in the offline sweep);
- full pairwise diagnostics at 1,000 nodes are enabled in comparison mode rather than bypassing validation.

Measured R480 ordinary-app experiment:

- layout-to-count-1,000: **3.64 s**;
- authoritative count: **1,000**;
- focus after clicking `12_고객지원`: **`cat-12`**;
- click-to-focus measurement: **934 ms** (poll interval included);
- surrounding node displacement: **377.5 px**;
- camera zoom **0.0890 → 0.1216**;
- pan changes panX/panY;
- wheel test did not change camera zoom in this run — NOT VERIFIED;
- focused label metrics: **9 visible / 71 candidates**; 31 labels budget-excluded; **READABILITY FAIL**;
- search found 2 `same-name.txt` cards but the first-card activation left `cat-12` selected — search reveal NOT VERIFIED;
- no browser errors.

Conclusion: the existing layout can be made to load the full 1,000-node hierarchical document by the bounded R480 projection experiment, but the resulting focused view is not sufficiently readable and the existing label budget suppresses most filenames. This is not accepted as successful 1,000-node navigation; it is a loadable experimental path with unresolved readability.

## Wheel navigation trace (evaluation branch)

Verified at 1900×870 on a point where `document.elementFromPoint` returns `CANVAS`.

300-node ordinary renderer:

- wheel listener target: `CANVAS`;
- deltaY `-120`, deltaMode `0`, no modifiers;
- camera zoom **0.16277 → 0.19488**;
- wheel-out returned to the prior camera;
- no browser errors.

1,000-node R480 base renderer, root:

- controller viewport **1535×792**;
- camera zoom **0.08899 → 0.11312** on wheel-in;
- wheel-out returned to **0.08899**;
- pair spacing increased on zoom-in and decreased on zoom-out.

1,000-node R480 after `cat-12` focus:

- camera zoom **0.12159 → 0.15457**;
- wheel-out returned to **0.12159**;
- node spacing **323.69 → 411.49 → 323.69**;
- click on `13_교육` after wheel changed focus to **`cat-13`**.

The earlier no-change observation was not a controller rejection: at a verified canvas point the controller reported wheel handling and the camera changed. The earlier run used an unverified point/viewport state; the retained regression now pins the point to the canvas and asserts both directions plus hit testing.

No application wheel code was changed; the correction is test/evidence fidelity for the existing controller path.

## Controller viewport synchronization (evaluation branch)

The previously observed 1600×900 failure was a real controller/graph dimension mismatch: controller viewport height 82px while the graph CSS viewport was 822px. The exact pre-fix initialization trigger was not captured, so the timing cause is not claimed.

Correction: `syncController()` now runs immediately after every installed frame. It updates the existing navigation controller from the session camera and the current CSS graph viewport; it does not recreate layers, force dimensions, or bypass ownership guards.

Post-fix dimension trace (device pixel ratio 1):

| Stage | Graph CSS | Canvas CSS/backing | Controller |
|---|---|---|---|
| 1600×900 startup/import | 1235×822 | 1235×822 | 1235×822 |
| 1900×870 | 1535×792 | 1535×792 | 1535×792 |
| resize back to 1600×900 | 1235×822 | 1235×822 | 1235×822 |
| Details collapsed | 1407×822 | 1407×822 | 1407×822 |

Wheel results:

- 300-node ordinary renderer: wheel-in/out PASS.
- 1,000-node R480 at 1600×900: wheel-in/out, spacing and post-wheel `cat-13` hit PASS.
- 1,000-node R480 at 1900×870: root and `cat-12` wheel-in/out, spacing and hit PASS.
- Browser errors: none.

Not executed: real wheel after Details/sidebar toggle and after resize. Those are documented as remaining checks, not claimed.

## Search activation through existing Hypertree R480

Actual UI reproduction: 1,000-node R480, search `same-name.txt`.

Result buttons:

- `f-0` — `20개 카테고리 지도 / 01_기획`
- `f-1` — `20개 카테고리 지도 / 02_연구`

Before correction, both clicks selected the exact file (Details `f-0`/`f-1`) but left focus at `root`. The first failing stage was parent navigation: the base path only called `navigateSearchParent` when the target was absent from `model.view().visibleSet`. At root all 1,000 nodes were visible, so parent navigation was skipped.

Correction: the base path now also requires `model.focusedFolderId === checked.parent.id`. Stale-result validation and the post-navigation visible/focus check remain unchanged.

Actual result after correction:

| Clicked result | Focus | Selected | Details |
|---|---|---|---|
| `f-0` (`01_기획`) | `cat-1` | `f-0` | `f-0` |
| `f-1` (`02_연구`) | `cat-2` | `f-1` | `f-1` |

Transition completed (`transition:null`), and no stale selection remained after switching from `f-0` to `f-1`.

Screenshots:

- `search-result-f0.png`
- `search-result-f1.png`

The retained executable test is `hypertree-search-check.mjs`. Its latest invocation could not attach to a fresh Edge debugger (`webSocketDebuggerUrl` null); the successful results above are the actual UI trace captured before that environment failure. Root/nested/300 and dirty/stale search regressions remain to be run.

