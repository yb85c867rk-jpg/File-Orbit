# Sidebar icon and Orbit status refinements — r133

## Orbit update feedback

The Orbit panel DOM order is now:

1. `Refresh list` actions
2. empty-list message or map list
3. Orbit status/update live region

`#orbit-status` remains `role="status"` with `aria-live="polite"`. Loading, error, stale, permission, truncation, and refresh feedback continue to use the same status element. Enumeration, sorting, selection, refresh, and protected Open behavior are unchanged.

## Sidebar icons

Copied the exact supplied local PNGs into `tests/harness/m5-exploration/assets/`:

- `graph_4_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.png` — SHA-256 `F15D48313BBC53934DF28A607B57035E674270780E9D85CFF579F8FD84588020`
- `hdr_weak_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.png` — SHA-256 `DEF08AA09D13073BF689A23F89D7EEAAAE93923C3C57B91E8363A8DA15D327B6`

The page references them only through relative `assets/…png` URLs. No Windows path or `file://` URL is used.

Both icons use a CSS mask against the supplied alpha channel, painted with `currentColor`, on a fixed 20×20 box with `contain` sizing. The Create Map icon inherits sidebar text color; the connected Orbit icon retains the existing accent color. Both are decorative (`aria-hidden="true"`), while the controls retain their accessible names, labels, actions, and tooltips.

## Validation

- Focused sidebar/Orbit/status suites: 26/26 passed.
- Full engine: 1099 tests, 1098 passed, 1 skipped, 0 failed.
- Browser visual/DOM inspection: headless Chrome at desktop and narrow widths, dark and light tokens, collapsed and expanded rail, connected Orbit. Icons measured 20×20; no horizontal overflow; expanded sidebar tooltip suppressed; collapsed native title preserved; status follows list in DOM order.
- Native filesystem acceptance: **NOT RUN**. Browser inspection is not native filesystem evidence.

No map data, Save/Open/Copy semantics, recovery, dependencies, database state, original user files, other projects, commits, pushes, deployments, or server state were changed.
