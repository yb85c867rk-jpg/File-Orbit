# M4 Static Labels and File Icons Harness

Deterministic browser harness for static node names and file-type icons over the
M4 Hypertree graph. It has no activation, opening, preview, focus, search, or
interaction behavior.

## Run

From the authorized project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8765/tests/harness/m4-labels/
```

Any equivalent static loopback server rooted at the project root works. Native
ESM imports require HTTP; `file://` is not supported.

## Controls

- Fixture F20/F200.
- Current/start/end phase.
- Actual browser DPR or synthetic 1/1.25/2/3, clearly distinguished.
- Resize updates Canvas and overlay on the existing instances.
- Recreate destroys/recreates both; Destroy removes only owned nodes.
- No node clicks or file opening.

## Presentation

Synthetic display names cover PDF, text, Markdown, image, archive, unknown,
extensionless, Unicode, and literal HTML-looking text. Icons are fixed local
inline SVGs; names are inserted with `textContent`, never `innerHTML`.

The overlay is one owned `div` per instance, positioned in the host content
coordinate space. The host has no padding/internal scrolling; coordinates are
translation-only CSS pixels. Canvas border/padding and CSS transforms are not
compensated.

## Status

Runtime machine-readable object:

```js
window.__M4_LABELS_STATUS__
```

It reports graph requested/prepared/drawn counts, label candidate/created/
visible/suppressed counts, icon count, text mismatch count, overlap/viewport
observations, measurement method, actual/synthetic DPR, lifecycle state, and
errors. `status.json` is the static NOT_RUN checkpoint.

## Limits

Mocked Node label dimensions do not prove browser font metrics or visual layout.
This harness does not establish accessibility navigation, interaction, file
opening/previews, mobile compatibility, or full M4 completion. Browser label
verification is **NOT RUN** unless manually executed and recorded.
