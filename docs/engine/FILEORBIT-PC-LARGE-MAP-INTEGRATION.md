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


## Focused filename readability and glyph collision (evaluation branch)

Cat-12 at 1900×870, 1,000 nodes, settled:

- immediate children: 50;
- label candidates: 71;
- created: 64;
- visible: 38;
- budget excluded: 7;
- priority suppressed: 21;
- label-node overlaps: 2;
- selected label visible;
- transition: null.

Before the change the same settled state produced 9 visible labels out of 71 candidates.

The `fixed-transition-policy` value is an invariant measurement identifier emitted by `transitionMetrics()`, not evidence that a transition is still active. The settled state reports `transition:null`.

Changes:

- focused folder and its immediate children are ordered before distant ancestors/context;
- the comparison overlay budget is 64 (ordinary remains 40);
- priority labels can use collision-checked offsets up to 96 CSS px;
- selected labels retain the full existing offset range;
- all offsets still obey viewport, label-label and glyph collision checks.

Cat-1 after search: 46 visible of 73 candidates. The ordinary 300-node path still uses the 40-label budget.

### f-0 / f-80 glyph collision

Measured at the default cat-1 focus:

- f-0 radius 4, f-80 radius 4;
- center distance 3.78 CSS px;
- radius sum 8;
- f-0 center hit resolves to f-80;
- f-80 center hit resolves to f-160;
- f-0 filename label hit resolves to f-0.

This is actual glyph overlap at Fit scale, not a radius-only bug. No forced “selected target wins” ordering was added. The tested disambiguation is the visible filename label: it resolves the exact file ID and remains actionable. Dot-center selection is not reported as passing.

Screenshots: `cat12-default-labels.png`, `search-result-f0.png`, `search-result-f1.png`.

## Active-branch focus framing (evaluation branch)

Measured constraint before correction: `centeredFit()` fitted every visible node, including all distant category context. The active cat-12 branch therefore shared the viewport with unrelated branches, keeping glyph centers close together.

Correction: comparison focus frames now fit and center the focused branch bounds (`ancestorIds + descendantIds`) instead of all visible nodes. Ordinary frames and the 300-node path keep the previous all-visible fit. Context outside the fitted branch is clipped by the camera rather than removed from the hierarchy.

Cat-12 at 1900×870 after settling:

- active-branch fit scope: `active-branch`;
- visible labels: 34;
- priority labels visible: 30;
- priority suppressed: 21;
- label-node overlaps: 2;
- f-0/f-80 center distance: **12.06 CSS px**;
- radius sum: **8**;
- f-0 dot hit: **f-0**;
- f-80 dot hit: **f-80**;
- f-0 filename-label hit: **f-0**.

The previous f-0 → f-80 and f-80 → f-160 dot collisions are no longer present in this focused frame.

Cat-1 after search: 60 visible labels; the two same-name results still select f-0/f-1 in cat-1/cat-2.

Automated: search test exit 0, 1900 wheel test exit 0, 1600 wheel test exit 0, navigation/label tests 18/18 pass. The earlier 1600 failure cause remains unconfirmed: the old assertions returned false while the recorded camera values passed, and rewriting the check expression produced a pass. No concrete reproducer established a product cause, so no wheel rewrite was attempted.

Screenshots: `cat12-default-labels.png`, `search-result-f0.png`, `search-result-f1.png`.


## Capacity ladder (evaluation branch)

Deterministic fixtures use 20 categories, depths 3–7, distributed files, plus 400-node wide, dense and deep cases. Counts include root, folders and files.

| Fixture | Total | Max immediate children | Import ms | Child labels @1900 | Child labels @1600 | Label hits | Label-node overlaps |
|---|---:|---:|---:|---:|---:|---:|---:|
| FileOrbit-1000 | 1000 | 49 | 4212 | 28/49 | 49/49 | all visible | 2 |
| FileOrbit-900 | 900 | 44 | 1910 | 27/44 | 44/44 | all visible | 2 |
| FileOrbit-800 | 800 | 39 | 3250 | 24/39 | 39/39 | all visible | 2 |
| FileOrbit-700 | 700 | 34 | 1418 | 22/34 | 34/34 | all visible | 2 |
| FileOrbit-600 | 600 | 29 | 940 | 22/29 | 29/29 | all visible | 2 |
| FileOrbit-500 | 500 | 24 | 667 | 18/24 | 24/24 | all visible | 0 |
| FileOrbit-400 | 400 | 19 | 471 | 15/19 | 19/19 | all visible | 0 |
| wide-400 | 400 | 19 | 685 | 16/19 | 19/19 | all visible | 0 |
| dense-400 | 400 | 280 | — | layout failed | — | — | — |
| deep-400 | 400 | — | — | layout failed | — | — | — |

Dense-400 failure: `experimental-v2-infeasible; parent cat-1 required 1.559 but available 0.511 at workspaceScale 16`.

Deep-400 failure: `experimental-v2-infeasible; parent depth-2 required 0.300 but available 0.256 at workspaceScale 16`.

At 1900, no level above 300 shows all immediate child labels. At 1600 every distributed fixture shows all immediate child labels. Complete save/reopen and per-capacity search/dot checks were not run.

The original 1,000-node goal remains the target; the measured recommendation is **300 as the supported free baseline**, with 1,000 retained as an experimental R480 case pending human visual review. Production admission was not changed.

## Post-transition label reflow (evaluation branch)

The preceding capacity table is superseded where it reports 1900 child-label counts.

Controlled 1,000-node, cat-12 comparison before correction:

| State | Child labels | Camera zoom | Policy | Overlaps |
|---|---:|---:|---|---:|
| Fresh 1900 | 28/49 | 0.19863 | fixed-transition-policy | 2 |
| Fresh 1600 | 30/49 | 0.19948 | fixed-transition-policy | 1 |
| 1900→1600 | 49/49 | 0.19948 | normal | 1 |
| 1600→1900 | 49/49 | 0.19863 | normal | 2 |
| 1900→1600→1900 | 49/49 | 0.19863 | normal | 2 |

The camera barely changed; viewport size was not the cause. The transition-completion path installed the restrictive transition plan and never ran a normal label placement afterwards. Resize called the normal placement path and produced 49/49.

Correction: immediately after `completeTransition()`, the harness calls the normal `overlay.update()` with the same scene, priority IDs, root and selection. This performs one coherent final placement; no label budget, collision rule, root protection or ownership guard was changed.

After correction, fresh and resized states are identical:

- 1900: 49/49 child labels, 49/49 exact label hits, 2 overlaps;
- 1600: 49/49 child labels, 49/49 exact label hits, 1 overlap;
- transition is null and policy is normal;
- camera remains 0.19863 / 0.19948 for the two viewports.

Re-run distributed capacity with the corrected lifecycle:

| Fixture | Total | Child labels @1900 | Child labels @1600 | Import ms |
|---|---:|---:|---:|---:|
| 1000 | 1000 | 49/49 | 49/49 | 4162 |
| 900 | 900 | 44/44 | 44/44 | 1962 |
| 800 | 800 | 39/39 | 39/39 | 1665 |
| 700 | 700 | 34/34 | 34/34 | 1175 |
| 600 | 600 | 29/29 | 29/29 | 922 |
| 500 | 500 | 24/24 | 24/24 | 801 |
| 400 | 400 | 19/19 | 19/19 | 528 |
| wide-400 | 400 | 19/19 | 19/19 | 472 |

Dense-400 and deep-400 still fail layout feasibility. The earlier 300-capacity conclusion is therefore not established; 300 remains the accepted product baseline, while 1,000 remains experimental pending human visual review. Production admission was not changed.

Screenshots: `reflow-A-1900.png`, `reflow-B-1600.png`.

## Search pagination and transition interruption (evaluation branch)

Search now searches the complete authoritative tree and paginates the ordered matches in pages of 50. The result panel shows the actual total, range and page, with Previous/Next disabled at the boundaries.

Measured on FileOrbit-1000.orbit for `보고서`:

- actual total: **198**;
- pages: **4** (50, 50, 50, 48);
- union of displayed IDs: **198**, duplicates: **0**;
- `보고서-606.png` and `보고서-206.png`: present;
- activation from page 2: `f-212`, parent `cat-13`, page/query retained;
- activation from page 4: `f-712`, parent `cat-13`;
- same-name.txt remains two distinct results (`f-0`, `f-1`);
- query change resets to page 1;
- Clear Search clears query, cards and pagination;
- document replacement while on page 2 clears pagination and query;
- ordinary 300-node search selects `root-file`;
- browser errors: none.

Search pagination test: `hypertree-search-pagination-check.mjs` (exit 0).

### Transition interruption

A proven jump was reproduced by resizing during an unfinished folder transition: the resize path cancelled the transition, restored the source focus (`root`) and reset the camera, abandoning `cat-12`.

Correction: viewport resize is deferred while a navigation transition owns the frame. After transition completion/error, the pending resize runs against the completed focus. Fresh evidence shows resize during the cat-12 transition ends at `cat-12`, not root.

Rapid second folder activation during a transition remains guarded with `transition-in-progress`; it does not replace the current transition. Wheel during a transition is likewise guarded. These are reported as interaction limitations, not silently claimed as fixed.

Search activation from settled cat-12 reaches cat-1 without browser errors. Post-transition label reflow remains intact (all 49 child labels at 1000 in controlled states).

Animation test: `hypertree-animation-check.mjs` (exit 0 for the measured scenarios); no screen recording was produced.


## Retarget opacity and remaining interruption limits (evaluation branch)

Replacement transitions now receive the displayed node-opacity map from the previous transition. `transitionOpacity()` blends each node from its actual visible opacity to the new target membership instead of restarting `prior.union` nodes at full opacity. Hit snapshots now carry opacity and nodes at or below 0.05 are not hit-testable.

Measured at application SHA `4880dd40ae29db119b0b5803d44fda55c4dd54a2`:

- second folder retarget during cat-12 transition reaches the last accepted target (`cat-20`), not cat-12;
- resize during transition still reaches cat-12 and processes the latest viewport;
- settled search after cat-12 reaches cat-1;
- existing search pagination, exact-result activation, wheel and label reflow checks pass;
- browser errors: none.

Still not implemented or not measured:

- wheel/pan interruption of transition camera (wheel remains guarded; pan NOT RUN);
- multiple accepted retargets in one transition;
- retarget while resize is pending;
- document replacement during transition;
- frame-level camera/projected-position/opacity continuity sampling;
- short recordings.

The opacity handoff is a source-level correction; no frame-level opacity continuity acceptance has been established. Human smoothness acceptance remains unproven.

## Invalid-query pagination cleanup

`search-results.js` now clears cards, active-result state, pagination and Back on invalid-query errors. A valid query restores page 1. Verified:

```text
Search is limited to 200 characters.
cards: 0
pagerHidden: true
backHidden: true
```

then `same-name.txt` restores two results on page 1.

## Final manual interruption results (SHA 9f44f94)

Measured at 1900×870:

- rapid retarget target 1 `cat-20`, target 2 `cat-19`, final focus **cat-19**;
- wheel during cat-12 transition: camera 0.08923/0,0 → 0.20704/-84.33,80.03; transition null; camera unchanged after 500 ms; subsequent cat-12 navigation succeeds;
- pointer pan during cat-12 transition: camera 0.11963/102.88,89.09; transition null; camera unchanged after 500 ms; subsequent cat-12 navigation succeeds;
- resize during transition final cat-12;
- search activation from cat-12 final cat-1;
- post-transition labels/hit reflow pass.

Opacity handoff is covered by the deterministic `retarget-opacity.test.mjs`; frame-level opacity/position sampling is not run.

Still NOT RUN: retarget while resize pending; document replacement during transition; recordings; frame-level continuity; 1600×900 interruption scenarios.

## UI refinement stage (evaluation branch)

Search pagination now uses a full-width three-column row below the card scroller:

- Previous at the left edge;
- centered indicator `1 / 4` with `aria-label="Page 1 of 4"`;
- Next at the right edge;
- status above the list contains only total/range, e.g. `198 matches · 1–50`;
- row hidden for empty/invalid/single-page states; native disabled buttons.

Verified at 1900 and 1600 widths; page 1/2/4, boundary states, later-page activation, invalid-query cleanup, Clear Search and replacement.

Informational no-attachment feedback previously used the outine status kind, whose CSS is screen-reader-only (width:1px, clipped); it also lacked the transient timer flag. Actual graph-label activation therefore produced no readable message. It now uses a distinct visible info kind with a 3-second timer, while routine readouts remain visually hidden. Navigation and dataset reset clear it; newer messages cancel older timers. Actual search-result + graph-filename activation, visible delivery, 3-second dismissal and the visible screenshot are covered by hypertree-notification-actual-check.mjs.

The renderer badge is hidden in normal UI, including the human testing URL. `rendererDiagnostics=1` explicitly shows it. Programmatic `window.__M5_RENDERER_MODE__` and `document.body.dataset.renderer` remain available.

Approved node colors:

| Role | Color |
|---|---|
| Root folder | `#818CF8` |
| First-level folders | `#C4B5FD` |
| Deeper folders | `#94A3B8` |
| Ordinary files | `#22C55E` |
| PDF files | `#F87171` |
| Ordinary labels (dark) | `#E2E8F0` |
| Ordinary labels (light) | `#1e293b` |

Verified root, first-level, deeper focused, ordinary file, PDF, root-level file, search-active fills, light/dark label tokens and clean document state.

Not run: structural edit/Undo/Redo color refresh, explicit selection-ring screenshot, keyboard pagination focus test, actionable-dialog notification regression, and a focused light-theme screenshot.

Actual notification interaction: `README-root.md` has no attachment, search-result activation selects/focuses it, and the graph filename label reports `attachment-unavailable`; the visible info message measures 560×34 CSS px and dismisses after three seconds. Screenshot: `notification-actual-visible.png`.

## Map Library navigation (step 1)

The sidebar now has one expandable Map Library section instead of Open Orbit and its File/Folder submenu. It remains visible without a connection and shows Choose Directory; a connected directory shows its name, Change Directory, the .orbit list, and Refresh below the list. Choosing uses the existing Orbit state/directory-adapter/open pipeline.

Cancelling the picker preserves the connected directory, list and current document. Changing directory does not replace the active map. The standalone file-opening menu was removed from the UI; internal open APIs remain.

Automated verification uses a synthetic `showDirectoryPicker` handle with two in-memory .orbit entries. It does not exercise native picker, permission, or disk behavior. Listed-map activation through a real .orbit file and duplicate-section removal are not yet exercised.

## Obsolete open-error lifecycle

Library/map open errors are now owned by the specific Orbit open request. Starting a newer opening clears only the previous open-owned status, and a successful open clears it before publishing its result. Older failed callbacks cannot restore the message because the request token must still be current. The current document remains installed when a candidate fails.

The retained actual Library-list regression opens 300, attempts deep-400 (failure preserves 300), reopens 300, opens 1000, waits for callbacks, and asserts the deep-400 error does not return. A separate test-hook gesture verifies that an unrelated actionable status is not removed by the scoped clear.

## Map Library directory persistence (step 2)

The adopted directory handle is stored as a structured-cloneable value in a dedicated `settings` record, key `map-library-directory`, in the existing `fileorbit` IndexedDB. It is not JSON and does not share map/document/recovery records. Writes are serialized and latest-wins.

Startup loads the handle and queries read permission without requesting it. Granted access restores the directory and enumerates `.orbit` files; prompt/denied states show the directory and `Reconnect Map Library`. Permission is requested only from an explicit reconnect click. A successful reconnect persists the handle again. Restoration never opens a map or writes a map file.

Failed adoption restores the previous valid connection. Cancellation leaves directory/list/settings unchanged. Storage read/write failures keep the session connection and report the limitation. Restore attempts are token-guarded against newer selections and disposal.

Automated verification uses a native OPFS directory handle (structured-cloneable) for same-profile reload, plus disclosed test hooks for prompt/denied permission, storage failure and delayed restore race.

## Map Library read permission and explicit write guidance

Map Library Choose/Change Directory now calls the directory adapter in read mode. Listing and opening maps do not request write access. Restoration and Reconnect remain read-only.

Write access is queried separately per save destination. If already granted, saves proceed. If write permission is missing, an explicit Save shows a centered “Permission to save maps” dialog with destination/file-specific text, Cancel and Continue. Only Continue invokes the browser write-permission request. Ownership, document identity, destination and operation guards are rechecked after the dialog and after the request.

Automatic/background saves never open the dialog and never request permission. They fail with a user-triggered save action available. Cancel/denial preserves content, dirty state, destination and Library connection; no download fallback is used. Legacy synthetic P1B save harnesses retain their prior adapter path unless the dialog-specific test flag is set.

Verification uses a native OPFS file handle for the read-only Library/open path, with simulated query/request outcomes for prompt/granted/denied cases. Native browser security prompts remain separate manual verification.

### Permission dialog startup visibility

The permission backdrop uses a dedicated `.permission-dialog-backdrop` class with an explicit `[hidden] { display: none !important; visibility: hidden; pointer-events: none; }` rule. The author `display:grid` overlay style no longer overrides native hidden presentation. Cancel/Continue use compact application button styling. A clean-startup regression verifies computed display/bounds, pointer hit testing, Create Map/Map Library controls, explicit dialog population, Cancel without request, Continue with request, and no empty backdrop after close/reload in both themes.

## Permission guidance refinement

Choose/Change Directory now opens a centered explanation before the native read-mode picker:

“Connect a Map Library folder” — explains that the folder stores topic maps, the next browser prompt is for listing/opening maps, saving may need extra permission, and connecting does not change or delete files. Cancel closes without invoking the picker. Choose Folder invokes the existing picker from the explicit action.

Startup restoration queries read permission silently. Prompt-required inline guidance tells the user to click Reconnect Map Library and allow in the browser prompt; no startup modal is shown. Reconnect queries again first: already-granted access refreshes without another request. Denial preserves the directory and Change Directory.

Explicit save uses “Permission to save this map” and destination-specific file/folder wording. Continue triggers the native request; Cancel/denial preserves unsaved state; background saves never prompt or request.

Native browser permission prompts remain intact and outside FileOrbit control. Delete Map File is not implemented or advertised.

## Create Map Step 1: Map Information and optional source folder

The Create Map form is reorganized into Map Information, a collapsed optional source-folder section, and Map Library Setting. Map description is stored on the candidate root as `data.description` using `validateDescription`; empty description is null. Source-folder import still uses the existing candidate/attachment limits and preview. Individual-file selection and the mixed drop target were removed from this modal; engine-level File inputs remain available elsewhere.

The Map Library Setting section retains the existing destination controls and accurately labels standalone versus connected destinations. Create still uses the existing save/creation pipeline and confirmation. Details now renders `data.description` for the root/selected node with pre-wrap text.

Known Step 1 transaction limitation: title-only creation still invokes the existing save-destination picker/transaction; there is no separate draft Library destination or publish-after-success redesign yet. Large source-folder import and collision behavior remain on the existing pipeline.

## Map Library collection storage (Phase A1)

A version-2 `map-libraries-v2` settings record stores `{version, libraries:[{id, handle, name, updatedAt}], selectedId, updatedAt}`. Handles are structured-cloneable File System Access handles, never JSON. Library IDs are application-generated stable IDs; names are actual directory names and are not identities. Selected IDs must reference a stored record.

`loadCollection()` is read-only. `migrateLegacyCollection()` is the only migration operation: an existing valid collection, including an empty collection, is authoritative; otherwise a legacy `map-library-directory` creates one Library and the legacy record is retained. Repeating migration is idempotent. Malformed/unsupported collection records fail explicitly and never fall back to legacy data.

`saveCollection()` serializes writes per API instance with latest-wins ordering and resolves after transaction completion. Failures return `{ok:false, reason, message}` for invalid records, invalid selected IDs, clone failures, storage errors and superseded writes. This is not cross-tab conflict protection. The current application still uses the legacy single-directory `load/save/clear` API; no sidebar or Create Map integration is active in Phase A1.


## Map Library collection application integration (Phase A2)

The application now uses one `LibraryCollectionController` over the A1 `map-libraries-v2` settings record. Startup invokes explicit legacy migration, loads the authoritative collection, restores the selected record, queries read permission without prompting, and enumerates only when already granted. Empty collections remain empty; malformed collection data reports an error and does not fall back to legacy state.

Choose/Change Directory still uses the accepted read-only picker and explanation. Successful adoption deduplicates by `isSameEntry`, preserves earlier records, adds a stable-ID record when new, selects it, and persists via the collection controller. Identity-comparison errors do not merge by name. Durable write failure keeps the session record and reports that it could not be remembered. Picker cancellation and adoption failure preserve the prior selection, list, settings and active document.

Reconnect and refresh remain read-only and operate on the selected record. Permission/listing status is tracked by Library ID. Application flows no longer call legacy `load/save/clear`; the legacy record and compatibility API remain for migration only. The visible sidebar remains the existing single-selected-Library UI. The new Map Library List, link-edit modal, Create Map restructuring, Upload, Unlink and Delete are deferred.

## Map Library collection list (Phase B1)

The sidebar section is now “Map libraries”. `Map Library List` switches between the shared linked-Library collection and the selected-Library view. The collection shows actual directory names, selected state, and concise access status; same-named directories are distinguished by abbreviated application IDs. Linking uses the accepted read-only explanation/picker and controller deduplication. Selecting a Library uses its stored handle, queries read permission without requesting it, clears the old list while loading, and enumerates only when granted. Permission-required selection shows the selected name and Reconnect.

Collection Refresh queries permission/status only and never enumerates or opens maps. Selected-Library Refresh re-enumerates only that directory. Both preserve the active document and writable destination. Returning to the current map’s Library restores highlighting through actual file identity. The directory-edit modal, aliases, Create Map changes, Upload, Unlink and Delete remain deferred.

Selection now advances the controller operation token even when `persist:false`, so a delayed adoption cannot overwrite a newer selection.

## Sidebar scrolling

The primary navigation rail is the sole vertical scroll owner. Internal navigation items, Map Library collection/selected views, panels, and `.orbit-list` grow naturally with `overflow: visible` and no inner max-height, including responsive overrides. Grid/flex tracks use `minmax(0, 1fr)` and `min-width: 0`; long file names ellipsize and directory names wrap, with full names retained in accessible labels/titles. The body/graph workspace remains non-scrollable. Verified with 55 long-named files, 12 Libraries, 1900×870, 1600×900, 700px height, 480px narrow layout, collapsed/expanded rail, light/dark and keyboard reachability of the last file plus Settings.

## Linked-folder editor (Phase B2)

The selected Library’s old Change Directory button is replaced by a compact pencil icon labelled “Change linked folder”. It opens a centered draft modal showing the current folder, “No replacement selected”, Choose Folder, Cancel and Apply. Choose Folder invokes the native read picker without adding a Library. Apply validates read access and listing, compares handle identity with the original and other records, and commits only after `relink` persistence succeeds.

Outcomes: same original is a no-op; a new directory replaces the handle/name under the same stable ID and preserves other records; an already-linked directory selects its existing Library and preserves both records; identity failures and permission/listing/storage failures retain the draft and original connection. The active document handle, identity, baseline, history, revision and dirty state are never changed. The icon/modal are hidden from startup and use the existing hidden-state/focus/escape conventions. Directory aliases and OS directory renaming remain unsupported.

## Root-only map creation (Phase C)

Create Map now collects a required title, optional multiline description, and a destination among the shared linked Map Libraries. Source-folder, individual-file and mixed-drop input were removed; every candidate is exactly one root folder with no dummy content. The form defaults to the currently selected Library, lists the same actual directory names as the sidebar, and selecting a row changes only the form destination. Link Folder uses the shared controller and read picker; Refresh updates access/status without requesting permission. Cancelling the form keeps newly linked records and creates no map.

Creation now stages the root candidate, obtains write permission, performs the existing case-insensitive collision check, encodes the complete file, creates and closes the file, establishes its saved baseline, and only then adopts the document with the real handle and a fresh history. The old Library file list is updated and the destination remains selected. A collision or pre-write failure leaves the active document and form intact. A post-write install failure reports that the file was created but not opened, leaves the current document in place, and never deletes the newly written file. Existing Save As/Download remain outside this flow; Upload is not implemented.

### Create Map compact Library controls

The Create Map modal omits explanatory/routine copy and provides a compact two-row Library area: “Linked Map Libraries” toggles a collapsed inline list with `aria-expanded`/`aria-controls`, and “+ New” is the right-aligned accessible “Link folder to Map Library” action. Selecting a Library immediately updates `aria-pressed`/selected styling, displays its actual name as the destination, and closes the list without routine status text. Refresh remains inside the expanded list. New-map descriptions use a live 500-code-point counter, reject 501+ at the form and candidate boundary, and preserve Unicode/IME input without truncation.

## Upload preparation service (Phase D1)

`prepareUploadAddition` is a pure preparation API under `src/engine/hypertree/exploration/upload-preparation.js`. It accepts the authoritative tree/registry references, destination folder ID, dataset token/revision, edition policy context, files/folders, and an `isCurrent` cancellation check. The source tree and registry are read-only.

The result contains a full cloned `candidateTree` (including all existing hidden nodes), a staging-only `attachmentRegistry` for new files, exact addition/ownership/summary metadata, and idempotent `dispose()`. `dispose()` clears only staged attachments. D2 must revalidate dataset/revision/destination ownership, transfer staged attachments into the live registry, and install through the existing editor transaction.

The service applies existing naming/case-collision rules, node counts, free/paid context limits (300/1000 plus any tighter caller or internal-paid test budget), depth limits, attachment limits and whole-request rejection. Supplied empty folders are retained. `folderListingComplete:false` records that the picker could not expose empty folders; preparation does not silently discard supplied folders. Upload preparation does not install, revise, save, or otherwise change the active map.

## Local Upload context action (Phase D2)

Folder context menus now include an Upload section with Local Files and Local Folder for the structural root and every descendant folder; file nodes do not expose it. Local Files adds multiple files directly under the captured destination. Local Folder uses one native directory input per selection, strips the picker root exactly once, passes the source folder as `sourceFolderName`, and reports `folderListingComplete:false` because that input does not expose empty directories. Empty-directory retention remains available through callers that can supply folder paths.

The preview is centered, application-styled, keyboard/Escape accessible, and shows destination path, added folders/files, resulting total against the applicable limit, attachment bytes, and any empty-folder limitation. Cancel disposes staged resources without changing the map. Preparation failures show a concise error with Cancel/Choose Again.

Add to Map revalidates document/dataset/revision/destination/ownership and disposal state, validates admission, transfers only new attachments into the live registry, and installs the D1 full candidate through the existing editor layout/commit/recovery boundary. Any transfer, layout, history or commit failure rolls back provisional attachments and leaves the previous tree/history/selection/destination intact. Successful upload advances the revision, creates one `structural-add-many` history action, and preserves the active document handle and baseline. Undo removes the whole addition; Redo restores the full hierarchy and attachment bindings. Attachments remain retained by tree/history references until ownership is released.

Save is separate from Add to Map. Upload success remains dirty when automatic save is blocked/failed, retains history, and reports the existing actionable save state; it never reports a failed save as saved. The native folder input limitation for empty directories and all synthetic browser/handle test adapters are disclosed in test evidence.
