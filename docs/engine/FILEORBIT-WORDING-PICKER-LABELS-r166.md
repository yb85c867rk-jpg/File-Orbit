# FileOrbit conflict wording and picker labels — r166

## Baseline
- Product baseline: r165 archive `3BE7A62A3DB45D7530197B48A585E6746337B49D0A0A40C53EC06E8E2F5D13C6`.
- No OntoMap access. No deployment, publishing, external hosting, paid/enterprise work.

## Confirmed external change
Title:
`This file has a newer saved version`

Description:
`Another window or app saved changes to this file. Keep both versions by saving your changes as a copy, or replace the saved version with your changes. Cancel keeps your changes open without saving.`

Actions:
- `Replace Saved File`
- `Save a Copy`
- `Cancel`

Filename remains separately displayed. Cancel is still initially focused.

Stable identifiers:
- `#file-conflict-replace` / `data-conflict-action="replace"`
- `#file-conflict-copy` / `data-conflict-action="copy"`
- `#file-conflict-cancel` / `data-conflict-action="cancel"`

Mapping is unchanged:
- Replace Saved File → existing explicit overwrite decision.
- Save a Copy → existing separate copy destination flow.
- Cancel → no write, unsaved edits retained.

## Unverifiable state
- Title: `This file could not be verified`
- Description: `FileOrbit could not verify the destination contents. Overwriting is unavailable; save a copy or cancel instead.`
- Replace Saved File remains hidden and disabled.
- Unknown/unverifiable states no longer enable replacement.

## Picker labels
Both native picker configurations now use exactly:
`Orbit files (*.orbit)`

Shared `ORBIT_FILE_TYPES` in `document-adapter.js` is used by Open and Save As. Preserved:
- `application/x-orbit` → `.orbit`
- single-file Open (`multiple: false`)
- `excludeAcceptAllOption: true`
- `.orbit` validation/default filename extension
- writable-handle behavior.

This is display-label only; no format change.

## Identity
| Artifact | r166 SHA-256 |
|---|---|
| file-conflict-dialog.js | `5FB4E1D3B2B5D3C8E83497054062B656784B83D77FF41A1BEDDCB2B379790F4C` |
| document-adapter.js | `B314CCB572DB52FB65A2AE09E02A68F634F38EED1C258CE5E24DA54C6C97B3C0` |
| main.mjs | `FDC1A768FC94EC09C9A943C6A24BE3CCB83C0234C1F4EAB5C67A25A89FE4F279` |
| index.html | `243646B689022C4C0C9734A37A339723D828E8B6676B8AC5B20414DC973C4FFC` |
| main-harness-init-runner.mjs | `22507B8FD6A0F3E5A24771D5F41A3AC2D732FB8B42215183FB3F8A4E029B0477` |

## Browser evidence
Actual browser DOM, not native OS picker screenshots:
- `evidence/native-r121/r166-conflict-newer.png`
- `evidence/native-r121/r166-conflict-unverified.png`
- `evidence/native-r121/r166-conflict-wording.json`

Observed:
- confirmed title/description/buttons exact;
- Cancel focused;
- unverified title and hidden/disabled replacement;
- stubbed Open picker options: description `Orbit files (*.orbit)`, `multiple:false`, MIME/extension unchanged.

Native picker appearance was **not** captured; picker labels are verified by adapter/browser-option assertions only.

## Tests
Focused adapter/dialog/opening/automatic/feedback: **24/24 PASS**.

Full serial result:
- p1b-main: **69/69**.
- Remaining: **1,067 tests = 1,066 pass, 1 skip, 0 fail**.
- Aggregate: **1,136 tests = 1,135 pass, 1 skip, 0 fail**.
- Both serial parts exited 0.
- Only skip: existing fake IndexedDB concurrency limitation.

## PASS / FAIL / NOT RUN
**PASS**
- Confirmed-change title/description/button wording.
- Stable action identifiers and unchanged mappings.
- Cancel focus, Escape/focus restoration, explicit replacement.
- Unverifiable wording distinct; replacement disabled/hidden.
- Exact Open/Save As filter description.
- `.orbit`/MIME/single-file/validation/writable behavior preserved.
- Save a Copy remains separate; Cancel writes nothing.
- No changes to placement, notification timing, format, limits, or save logic.

**FAIL**
- None observed in focused browser/automated checks.

**NOT RUN**
- Native OS picker screenshot/acceptance.
- Native two-window disk hash and `"Conflict test B"` verification.
- Actual Android/iOS device check.
- Independent native Save/Open after this change.

Free-edition acceptance remains **INCOMPLETE** pending native picker and disk/description checks.
