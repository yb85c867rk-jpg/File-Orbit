# Connected Orbit menu — r128

## Scope correction

**Cancelled requirement:** the header X / Close FileOrbit button, application exit dialog, `window.close()`, and exit controller were not implemented. Users close FileOrbit through the browser tab. Existing `beforeunload` protection and normal `pagehide`/destroy cleanup are unchanged. The header remains brand-only.

## Implemented menu

A functional connected-Orbit menu is placed between Save As and Settings:

- Connected state shows a folder icon and the actual directory name; collapsed navigation shows the icon with an accessible name and full-name tooltip.
- Expanded navigation shows icon plus the directory name, truncated with an accessible full `aria-label`/title when long.
- The toggle has `aria-expanded` and `aria-controls="orbit-panel"`, native keyboard activation, and existing visible focus styles.
- Clicking toggles the saved-map list beneath the menu. If the rail is collapsed, activating the menu expands the rail into the usable list state.
- The list uses the existing protected listed-map Open path and marks the active map with `aria-current` plus the existing dot.
- Refresh, Close Orbit, and Add to Orbit remain inside the expanded section with honest disabled states.
- With no Orbit connected, the section and toggle are hidden; no inert folder icon remains. Folder selection remains through integrated Open File and Create Map.

The menu reuses `orbitState`, the directory adapter, the snapshot renderer, and the existing document-opening pipeline. No duplicate directory state, map cache, persisted handle, multiple-Orbit management, recursion, watching, rename/delete, synchronization, or database change was added. Integrated Open File and the sidebar share one state and update immediately in both directions.

## Preserved behavior

- Header unchanged; combined with built-in browser tab closing.
- Integrated Open File and theme-only Settings unchanged.
- Dirty editor/document decisions; automatic-save queue, failure feedback, conflict handling; destination baseline protection; stale ownership; exact bytes/IDs.
- Active editor draft, focus, and selection across rail expansion (actual test).
- Narrow/short-screen scrolling and fullscreen containment via existing app-root/nav overflow rules and menu/list max-height rules.

## Verification

Actual-control additions:

- `orbit-menu-main.test.mjs`: disconnected inert-icon check; integrated Open connection; placement/labels/aria; list expand/collapse; current marker; actions; dirty replacement Cancel; editor draft/focus/selection across rail expansion; sidebar-close to integrated-Open sharing; close/disconnect; completion marker and watchdog.
- `orbit-panel.test.mjs`: disconnected hidden toggle, active accessible toggle, collapse/expand state.
- Static navigation/Open/shell tests: placement, accessible toggle, retained actions, truncation/scroll/fullscreen CSS, no stale Settings wording.

Focused Orbit/Open/navigation/autosave/editor/lifecycle regression: **141/141 passed**.
Full engine: **1089 tests, 1088 passed, 1 skipped, 0 failed**.
Browser evidence: `browser-orbit-menu-expanded-r128.png`, `browser-orbit-menu-collapsed-r128.png`, `browser-orbit-menu-narrow-expanded-r128.png`, `browser-orbit-menu-narrow-collapsed-r128.png`, `browser-orbit-menu-r128.json`. Long-name measurement: client 121px vs scroll 410px with full aria-label/title; no horizontal overflow at 390px.

## Limitations

- Current-session connected-Orbit menu only; no persisted handles, multiple-Orbit management, recursion, watching, rename/delete, synchronization, or database changes.
- Synthetic main-entry tests are not native filesystem evidence. Native picker/write/keyboard/responsive acceptance remains NOT RUN.
- No IndexedDB reset, original document/folder modification, dependency install, commit, push, deploy, server stop, or OntoMap/MORAN-DCP changes.
