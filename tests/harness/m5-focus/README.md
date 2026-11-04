# M5 Immediate Focus Harness

Deterministic browser harness for immediate Hypertree focus/recenter. It keeps
existing mouse selection and adds an explicit **Focus selected** action. There
is no animation, focus-on-click, pan/zoom, opening, preview, search, touch, or
keyboard navigation.

## Run

From the authorized project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8765/tests/harness/m5-focus/
```

Equivalent loopback static server rooted at the project root works. Native ESM
requires HTTP; `file://` is not supported.

## Controls

- F20/F200, current/start/end phase, actual or synthetic DPR 1/1.25/2/3.
- Click a node to select it.
- **Focus selected** immediately applies the Möbius focus view for the selected
  stable ID.
- **Reset focus** restores the base layout.
- Clear selection.
- Resize/DPR reprojects the focused view and preserves the displayed focus ID;
  selection is restored only when still hittable.
- Fixture/phase replacement resets focus and selection.
- Recreate/destroy reset to the base view.

## Status

```js
window.__M5_FOCUS_STATUS__
```

Contains operation, fixture/phase/generation, DPR/viewport, selected ID/name,
requested vs displayed focus IDs, focus state, normalized focus point and center
error, prepared/drawn counts, labels, controller frame metadata, lifecycle,
actual user events, programmatic events, numerical probes, and errors.

`lastUserEvent` is click/empty derived. `lastProgrammaticEvent` covers focus,
reset, resize, clear, update, and invalidate. `numericalProbe` is separate.

## Limits

Focus is immediate and only through the explicit button. No focus-on-click,
animation, touch/keyboard, accessibility navigation, or browser certification is
claimed. Browser focus verification is **NOT RUN** unless manually executed.
