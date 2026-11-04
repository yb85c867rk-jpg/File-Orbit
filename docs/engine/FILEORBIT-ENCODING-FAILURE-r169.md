# FileOrbit encoding-failure feedback and secure-context diagnosis — r169

## Baseline
- Product baseline: r168 archive `D644BD5568DB2174D1D928555D39772DB9E70A93B7BD3A82C725DD1AC5955EE2`.
- No OntoMap access. No deployment, publishing, cloud-service integration, paid/enterprise work.

## Diagnosis
The observed technical text came from the document-save encoding catch in `saveDocument()`. Encoding computes SHA-256 for every attachment through Web Crypto:

- `crypto.subtle.digest('SHA-256', …)`
- `TextEncoder`, `Blob`, `File`
- for direct destination writes: File System Access (`showSaveFilePicker` / writable handle)
- for environments without File System Access: download handoff after encoding

The reported test origin is `http://192.168.1.162:8099`, a private LAN address. It is **not a secure context**. Browser capability check against that origin:

| Capability | `http://127.0.0.1:8099` | `http://192.168.1.162:8108` |
|---|---|---|
| `isSecureContext` | true | **false** |
| `crypto.subtle` | available | **undefined** |
| `showSaveFilePicker` | available | **undefined** |
| `showOpenFilePicker` | available | **undefined** |
| TextEncoder / Blob | available | available |

Evidence: `evidence/native-r121/r169-secure-context.json`.

This is consistent with a **secure-context environment restriction**, not an encoding-integrity/product defect: a map with attachments cannot compute the required SHA-256 on Web Crypto at an insecure origin. The actual iPhone Safari exception was not captured, so the exact Safari error code remains unconfirmed; the result is code-path-consistent with `crypto-unavailable`, but is not being asserted as captured device evidence.

Required for direct saving at a LAN origin:
- HTTPS with a trusted certificate (or localhost origin), so Web Crypto is available;
- a browser that supports File System Access for direct writable handles; otherwise FileOrbit’s download fallback is expected after successful encoding.

Integrity checks were **not weakened**; no insecure or substitute hash was introduced.

## Implemented feedback
Confirmed encoding failure now displays exactly:

`We couldn’t create the map file. Your changes are still in this map. Please try again.`

- The retained-changes sentence is included only when the current map/tree is still the encoding snapshot and the app is not being destroyed.
- A fallback without the retained-changes sentence exists for a non-preserved case.
- Technical diagnostics remain in `lastDocumentFailure`: stage `encoding`, code/name/message, and reason.
- The shell notice is the established owner for manual document saves; editor failures stay editor-owned.
- Automatic-save feedback is suppressed after a manual encoding failure, and stale automatic callbacks are ignored by token/blocked state, preventing duplicate shell + save-feedback notices.
- A manual retry unblocks automatic saving; explicit automatic recovery actions can still update their own feedback.
- No successful save or download is reported; destination identity, dirty state, baseline, saved revision, and writes remain unchanged.
- Save and Save As remain available.

Test hook `__M5_SAVE_ENCODE_FAILURE__` injects the failure only in tests.

## Identity
| Artifact | r169 SHA-256 |
|---|---|
| main.mjs | `3060780E1FB7F6C60884DA601FD5C48384D3C575DE27B67FC8B73B6F45975CF8` |
| main-harness-init-runner.mjs | `8E8F87C20933B51F224B1AD28FFFA1A66A49B0B8B056BEDC30A3BCFBAD2EB4DF` |

## Test evidence
Focused `OPEN_WORKFLOW` regression now covers:
- exact friendly message and absence of technical wording;
- technical stage/code/name/message retained in diagnostics;
- no duplicate save-feedback;
- dirty map/edits preserved;
- handle, name, mode, baseline, saved revision preserved;
- zero destination writes;
- Save and Save As available;
- no “Saved”/“Download started” status;
- subsequent retry succeeds after clearing the injection.

Focused tooltip/navigation/responsive/layout/sidebar/open/automatic/conflict: **33/33 PASS**.
Full serial results: pending final run.

## PASS / FAIL / NOT RUN
**PASS**
- Friendly retained-changes feedback for confirmed encoding failure.
- Technical details remain only in diagnostics.
- Single feedback owner; no duplicate automatic-save notice.
- Dirty state, edits, document identity, destination, and retry actions preserved.
- No false success/download status.
- Existing opening/saving/recovery/conflict/notification/free-limit behavior retained.
- Secure-context capability difference reproduced in browser emulation.

**FAIL**
- None observed in focused checks.

**NOT RUN**
- Actual iPhone Safari exception capture and device verification.
- Native OS picker/disk and `"Conflict test B"` verification.
- Actual Android/iOS device check.
- HTTPS LAN-origin deployment/acceptance (explicitly out of scope: no deployment or cloud integration).

Free-edition acceptance remains **INCOMPLETE**.

## Remaining actual-iPhone checks
1. Capture Safari console/exception for the failing save and confirm the diagnostic code.
2. Confirm `window.isSecureContext` and `crypto.subtle` availability on the actual origin.
3. Retry from HTTPS/localhost and verify encoding, saving, and conflict protection.
4. Confirm File System Access availability or expected download fallback on that iOS version.
