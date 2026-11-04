# FileOrbit Create Map Browser Blockers

Status: **FIXED in Node/mocked-DOM tests — native browser verification NOT RUN**

## 1. Zero viewport during creation

Root cause: `viewport()` measured `#graph-host`, which is hidden during empty startup and creation suspension. In real browsers a display:none host measures 0×0, so candidate fit failed with `centered-fit-infeasible`.

Correction:

- `viewport()` now measures the visible `#graph-wrap` layout container.
- Surface creation, candidate layout/refine, base radius, fit projection, frame staging, resize, and labels all consume that same viewport.
- The old graph host remains hidden during creation without collapsing the measurable graph-wrap area.
- No dimensions are invented, no padding/tolerance is relaxed.
- A genuinely zero graph-wrap returns `reason: 'zero-viewport'` with an actionable error, keeps the dialog/preview open, and retries successfully once the container has usable size.
- The fake DOM now reports zero for hidden elements and zero ancestors; it no longer claims hidden hosts have 1100 px.

## 2. Dialog CSS and stages

Root cause:

- A stray single quote before `.create-map-backdrop` invalidated the malformed rule.
- `.create-map-form` and `.create-map-actions` declare `display:grid/flex`, which overrides the UA `[hidden]` rule.
- Hidden confirmation/form stages could therefore remain visibly laid out.

Correction:

- Removed the stray quote.
- Added explicit hidden rules for form, actions, preview, and confirmation.
- Added explicit hidden rule for hidden file inputs.
- Backdrop remains fixed/inset/grid-centered within the application overlay; dialog max-height/overflow and preview max-height/scroll remain.
- Stage transitions show only form+preview+actions or confirmation.
- Focus containment, Escape, focus fallback, and cancellation behavior preserved.

## 2a. Literal escape correction (r31)\n\nTwo style rules contained literal backslash-n text instead of real newlines, corrupting selector parsing and leaving the form visible with confirmation. Those sequences were replaced with real newlines. The same style block was audited for other escape text and stray quote tokens; a remaining lone quote line was removed. No map-existence or replacement semantics changed.\n\n## 3. Create versus replacement

- Dialog receives explicit `hasCurrentMap: () => hasMap`.
- Empty startup: Create Map submits directly; no replacement prompt and no history-cleared claim.
- Existing map: explicit Replace map confirmation remains.
- Successful first creation reports `Created a new map.`; replacement reports history clearing only when a prior map existed.
- Failure without a prior map returns to empty startup with `Create Map failed. …`; it never claims a previous frame could not be restored.
- Existing-map failure/cancel still uses the coherent restoration path.

## Verification

- Full `tests/engine`: **695/695 pass**.
- Exploration: **164/164 pass**.
- Syntax checks: pass.
- CSS source checks: stray quote absent; hidden display rules, file-input hidden rule, centered backdrop, scrollable preview/dialog verified.
- Actual main entry: empty startup geometry, hidden host 0 / graph-wrap 1100×473, nonzero canvas sizing, no-map direct create, existing-map confirmation-only stage, resize during creation uses current viewport, unchanged cancel preserves camera, Dark/Light restoration colors, zero-viewport error/retry.
- Native browser verification: **NOT RUN**.

## Limitations

- No real browser was available; CSS/layout is verified from source and realistic mocked geometry, not browser rendering.
- Fullscreen/visual modal centering in a real fullscreen element was not executed.
- IndexedDB/persistence, import/export, Embed, UI polish, and tutorial slides remain unimplemented.

