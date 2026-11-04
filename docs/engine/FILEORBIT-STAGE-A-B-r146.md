> **Superseded by r147 for review defects and production architecture notes.** See [FILEORBIT-REVIEW-r147.md](FILEORBIT-REVIEW-r147.md).

﻿# Stage A/B — search highlight color and local read-only embed — r146

## Baseline
- Project is not a Git worktree: `git branch/rev-parse/status` fail with “not a git repository”. No current branch or commit exists to record.
- Baseline reference archive: `review/fileorbit-search-reset-r145.zip`, SHA-256 `CB4590093B54E1FB7258813B59D6272DECF5E0EF180EB9F2B507254FE1C70692`.
- Baseline `tests/harness/m5-exploration/main.mjs`: `231DF76410F0AA328FE2DBCD041804C44046002C4C61F6A369E08B4160EF25E1`.
- Baseline `tests/harness/m5-exploration/index.html`: `22A64619CCD1FF98A645232E3EBF82650165C91F2AAA212384F90635CC844F2F`.
- Pre-existing untracked local artifacts (`.browser-prof-*`, `src.zip`, `docs*.zip`, etc.) were preserved.

## Stage A — search highlight color
- Shared token: `src/engine/hypertree/exploration/search-highlight.js`, `SEARCH_HIGHLIGHT_COLOR = '#E74C3C'` (RGB 231,76,60).
- `highlightSearchFolderScene()` is the only folder-tint helper used by standalone FileOrbit and the embed viewer.
- Dark stroke `#FCA5A5`, light stroke `#7F1D1D`; dashed outline uses the same `#E74C3C` token. Selection remains the existing solid indigo ring.
- Search semantics unchanged: full authoritative match set, ancestor chain, hidden branches, result cap, temporary presentation, clear/replacement reset, close-retains.
- Canvas is the presentation surface; there is no separate DOM/SVG folder-color layer to update. Labels remain readable and are not recolored.

## Stage B — local read-only embed slice
### Implemented
- `embed-viewer.html` / `embed-viewer.mjs`: read-only viewer reusing existing layout, exploration model/session/frame, canvas renderer, label overlay, searchTree, shared red-highlight helper, mouse navigation, folder navigation, back, and responsive canvas resizing.
- `embed-snapshot.js`: versioned snapshot contract `fileorbit.embed.snapshot` v1, maximum 300 nodes including root, bounded depth/children/strings, unique IDs, root folder, only `description` in `data`.
- `embed-sample.json`: synthetic 10-node map.
- `embed-host.html` / `embed-host.mjs`: real parent page → sandboxed iframe integration with source/origin/type/size/schema validation. Local fixture only.
- `embed-dialog.js` + enabled Embed toolbar action: dialog distinguishes local preview from unavailable external embed URL; copy-embed-code is disabled.
- Embedded mode has no editing, drag/reparent, automatic document writes, history, or attachment opening. File selection shows an honest unavailable notice.
- No local files, IndexedDB, handles, permissions, paths, credentials, or attachments are sent to the viewer. Parent pages cannot access them.

### Local fixture
Serve the project root and open:
`http://127.0.0.1:8099/tests/harness/m5-exploration/embed-host.html`
The Embed dialog’s “Open local iframe preview” link opens the same fixture.

### Security/sandbox
- Local fixture uses `sandbox="allow-scripts allow-same-origin"` only because same-origin ES modules require it; it is development-only and carries synthetic data.
> **SUPERSEDED BY r147:** The former production recommendation combining `sandbox="allow-scripts"` with ordinary exact-origin messaging is incomplete. Opaque sandboxed frames report `origin: null` to the parent and need CORS or bundling for module assets. See [FILEORBIT-REVIEW-r147.md](FILEORBIT-REVIEW-r147.md); do not use the old paragraph as current production guidance.
- Parent validates `event.source === iframe.contentWindow`, exact local origin, message type, and payload/schema. Viewer validates `event.source === window.parent` and exact configured parent origin, plus size/schema.
- Labels/descriptions are rendered via `textContent`.

### Architecture decisions recorded
- **Snapshot vs live:** versioned read-only snapshot; no live map channel.
- **Hosting/stable URL:** not implemented; local origin is not shareable.
- **Access policy:** no public access; external access requires an explicit future policy.
- **Update/version:** schema version 1; no in-place updates.
- **Revocation/cache:** no hosted copies/cache policy yet.
- **Cross-origin:** exact origin allowlist, CORS, sandbox, CSP/frame-ancestors required.

### Remaining blockers to external Embed
- Hosting and stable URL ownership.
- Sharing/access policy, revocation, cache/update behavior.
- Attachment sharing model or permanent unavailable state.
- Production cross-origin viewer deployment with CSP/CORS/sandbox.
- No attachment data included in this slice.

## Verification
- Focused Stage A/B: 77/77 PASS.
- Full engine: 1111 tests, 1110 passed, 1 skipped, 0 failed PASS.
- Exact archive focused: 77/77 PASS.
- Browser local iframe: PASS — parent loaded viewer, 10 nodes, read-only, no editor; folder result navigated to Field Notes; search “Coastal” highlighted 2 folders; narrow resize 454×532 with 454×363 canvas and no horizontal overflow.
- Browser embed dialog: PASS — external URL unavailable, local fixture link, disabled copy code, Escape/focus behavior.
- Native iframe/host deployment checks: NOT RUN.

### Snapshot fields included/excluded
Included: schema, version, title, node `id`, `name`, `kind`, optional `description`, and `children`. Excluded: handles, paths, credentials, permissions, IndexedDB records, attachment bytes, attachment metadata, links, and arbitrary node metadata. The snapshot clone is bounded by the free 300-node limit.

### Production embedding headers
> **SUPERSEDED BY r147.** No production header set has been verified. See [FILEORBIT-REVIEW-r147.md](FILEORBIT-REVIEW-r147.md) for corrected local-versus-production constraints; the local fixture is development-only.

### PASS
- Embed snapshot contract/300-node limit/hostile text/malformed payload unit tests.
- Search highlight shared-token/renderer/full-match tests.
- Main search highlight actual input, clear, replacement, focus/theme/navigation tests.
- Local parent → sandboxed iframe → viewer integration in real Chrome.
- Embed dialog external-URL/copy-code/local-link behavior in real Chrome.
- Standalone FileOrbit full regression suite.

### FAIL
- None.

### NOT RUN
- Native cross-origin hosted embed, production CORS/CSP headers, access/revocation/cache, attachment sharing.
- Native platform/browser matrix beyond the local Chrome fixture.
