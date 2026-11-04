# r147 review corrections

## 1. UTF-8 embed message limit
- `embed-snapshot.js` now measures serialized messages with `TextEncoder`, not UTF-16 string length.
- `EMBED_MAX_BYTES = 524288` is enforced in both `buildEmbedSnapshotMessage()` and `parseEmbedSnapshotMessage()`.
- ASCII, Korean, emoji, below/at/above-boundary, 200×1000-Korean-description reproduction, and builder/parser compatibility tests pass.
- Builder rejects oversized outgoing snapshots rather than producing payloads the parser rejects.

## 2. Host handshake timers
- Added `embed-handshake.js` with explicit states: idle, loading-iframe, loading-snapshot, loaded, timeout, error, destroyed.
- Every state transition clears obsolete timers; actual iframe load and ready events cannot leave an older timeout behind.
- Late ready/error after a successful acknowledgement cannot replace success.
- Unit tests cover load→ready, ready→load, timeout recovery, late events, and success. Real Chrome stayed successful beyond 15 seconds.

## 3. Origin validation
- Removed `parentOrigin=*` bypass.
- `normalizeParentOrigin()` requires concrete http/https origin, rejects wildcard, null/opaque, malformed, credentials, and unsupported protocols.
- Viewer requires exact `event.source === window.parent` and exact normalized `event.origin`.
- Viewer sends ready/loaded/error only to exact parent origin; no raw error broadcast with `*`.
- Host validates source, exact origin, ready/schema/version, loaded node count/title, error message bounds, and exact field sets.
- Executable EventTarget dispatch tests cover wrong origin and wrong source window.

## 4. Lower-left notice
- Removed the permanent startup read-only notice in the embedded viewer.
- Read-only state remains in the header.
- Attachment attempts show contextual “File attachments are not available” feedback only after the action.
- Actionable errors remain visible.

## 5. Embed dialog keyboard behavior
- `embed-dialog.js` now stores the actual invoking element, restores focus to it on close, traps Tab/Shift+Tab, closes on Escape, and marks background app children inert while open.
- Repeated open/close cycles clean listeners/state and restore background inertness.
- Real Chrome verified:
  - Close → Tab → local preview link → Tab → Close;
  - Shift+Tab from Close → local preview link;
  - Escape closes and restores focus to `#embed-action`;
  - three repeated cycles;
  - narrow viewport follows the same behavior.
- Copy embed code remains disabled and clearly unavailable.

## Corrected architecture notes
The local tested configuration is **same-origin iframe + `sandbox="allow-scripts allow-same-origin"` + exact-origin messaging**. This works for the local ES-module fixture, but it is only a development demonstration.

Production options are not verified and differ materially:
- A dedicated viewer origin without a sandbox can preserve exact origins and module loading, relying on CSP/frame-ancestors and CORS for embedding control.
- `sandbox="allow-scripts"` creates an **opaque origin (`null`)**. Parent→viewer messages still carry the parent origin and can be exact-validated. Viewer→parent messages arrive with origin `null`, so the parent cannot exact-origin-validate the child; it must validate `event.source` plus strict schema/nonce, or the design needs a different messaging architecture. ES modules from an opaque origin also need CORS (`Origin: null`) or bundling.
- The local same-origin fixture does not prove production cross-origin isolation or storage isolation. The viewer intentionally has no storage access, but that is not a technical proof that storage access is impossible.

Production still requires CORS, CSP `frame-ancestors` allowlisting, `Permissions-Policy`, hosting, stable URLs, access policy, revocation/cache behavior, and attachment sharing.

## Verification
- Focused Stage A/B/review: 80/80 PASS.
- Full engine: 1114 tests, 1113 passed, 1 skipped, 0 failed PASS.
- Exact archive focused: 80/80 PASS.
- Browser: local iframe, 10 nodes, folder navigation, 2-folder #E74C3C search highlight, narrow 454×532 iframe / 454×363 canvas, success beyond 15s, no startup bottom notice, dialog keyboard containment/restoration, no exceptions.
- Native hosted cross-origin/CSP/storage-isolation checks: NOT RUN.

## Limitations
- External hosting/public embed remains unimplemented.
- Attachment sharing remains unavailable.
- Local fixture is development-only and must not be presented as a production embed.
- Free edition 300-node limit and attachment limits unchanged.
