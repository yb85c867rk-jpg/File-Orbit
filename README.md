# FileOrbit

FileOrbit is an experimental, local file-tree visualization project. It explores a
synthetic filesystem graph with a canvas renderer, adaptive layout, depth-context
navigation, label overlays, and session-local drag-and-drop reparenting.

FileOrbit was previously developed under the project name Visual Directory.

## Current scope

- Experimental adaptive layout v2 with opt-in refinement and viewport fit.
- Depth-context exploration: all nodes at or above the focused structural depth plus its complete subtree.
- 780 ms exploration transitions, visibility fades, and stable label lifecycle.
- E1–E2 + Slice 1 right-click menu (Edit Folder/Edit Data/Add Folder/Add Data), atomic folder/data forms, normalized web links, and safe clickable web-link labels, session-local stable form/IME behavior.
- Session-local structural move: file or folder subtree onto a folder.
- No filesystem writes, user-facing Save/Open persistence, undo/redo, rename, delete, or native paths. P1a IndexedDB repository internals are implemented but not wired to UI.

Reparented topology is session-local and is reset by reload or dataset replacement.

## Source layout

```text
src/engine/hypertree/       graph loader, layout, exploration, render, navigation
tests/engine/               Node test suites
tests/harness/              Browser harness pages
docs/engine/                Engine contracts and verification notes
docs/VISUAL-DIRECTORY-V2-IMPLEMENTATION-PLAN.md  active plan (filename retained)
evidence/                   Test and verification evidence
review/                     Preserved review archives
```

The working directory, plan filename, harness URLs, exported APIs, and historical
archives retain legacy `visual-directory` identifiers where renaming would affect
compatibility or provenance.

## Checks

```powershell
node --test --test-isolation=none
```

Current reported full `tests/engine`: 1137 tests, 1136 passed, 1 skipped (existing fake IndexedDB concurrency limit), 0 failed when run serially. r169 used a split serial run because the 69-test p1b-main file spawns 69 actual main-entry runners: p1b-main 69/69 and remaining 1068 tests with 1067 pass/1 skip/0 fail, both exit 0; parallel subprocess runs remain timing-sensitive. P1b adds explicit Save/Open UI (69/69 actual main-entry integration); P1a/P1b use the shared repository and runtime reconstruction. Native browser durability/drag verification remains **NOT RUN** unless separately reported.

## Implementation plan

See [docs/VISUAL-DIRECTORY-V2-IMPLEMENTATION-PLAN.md](docs/VISUAL-DIRECTORY-V2-IMPLEMENTATION-PLAN.md).

Orbit workspace plan: Slice 1–5 are implemented and their bounded automated review is accepted. Slice 6 native acceptance is **partial/blocked**; the r122 navigation refinement removes the primary rail Save/Open Orbit actions, adds a unified **Open Orbit** integrated map browser (folder + list in one dialog), automatic persistence after authoritative reparent/Undo/Redo (with r126 temporary-editor and conflict-Cancel corrections r127 Open install-settling coverage, r128 connected Orbit menu, and r129 direct Create Map/sidebar tooltip refinements and r130 save-location wording plus r131 Copy Map/sidebar simplification and r132 stale-encoding ownership correction and r133 sidebar icon/status refinements and r134 Open Orbit naming/icon and r135 English messages and r136 .orbit-only documents/help and r137 help interaction correction and r138 approved variation 06 branding and r139 feedback presentation and r140 feedback corrections and r141 startup/scope corrections and r142 nonvisual routine feedback and r143 routine-path corrections and r144 search-result folder highlighting and r145 search reset corrections, r146 search-highlight color and local read-only embed, r147 review corrections, r148 free-edition stability review, r149 desktop data-safety review, r150 PDF preview correction, r151 native desktop acceptance, r152 graph-label improvements, r153 graph-label defect corrections, r154 selected-ordering and leader cleanup fixes, r155 selected-leader opacity lifecycle, r156 folder-context label priority, r157 viewport-aware label eligibility, r158 viewport-edge glyph eligibility, r160 conflict modal + consolidated cancellation feedback, r161 repeated-cancellation feedback ownership, r162 approved direct-file + Connect Folder workflow, r163 Open Orbit submenu, r164 submenu typography + centered auto-dismiss notices, r165 single-owner cancellation notice, r166 conflict wording + picker labels, r167 narrow toolbar overflow, r168 touch tooltips + landscape Details, r169 friendly encoding failure), and theme-only Settings. The user reports PC manual tests pass; that is user-reported, not independent or cross-platform acceptance. Rename/delete/recursion/watching/persisted handles/sync remain deferred: [docs/engine/FILEORBIT-ORBIT-IMPLEMENTATION-PLAN.md](docs/engine/FILEORBIT-ORBIT-IMPLEMENTATION-PLAN.md).










































































## Persistence planning

IndexedDB **P1a repository/codec/runtime foundation is IMPLEMENTED** and tested against an IndexedDB-compatible transaction double. Save/Open UI, replacement/dirty workflow, and portable backup remain **PLANNED / NOT IMPLEMENTED**. See [docs/engine/FILEORBIT-PERSISTENCE-AND-BACKUP-PLAN.md](docs/engine/FILEORBIT-PERSISTENCE-AND-BACKUP-PLAN.md), plan revision **r35.1**. Browser storage is device/origin-specific and is not a backup or cross-device synchronization service.



































































