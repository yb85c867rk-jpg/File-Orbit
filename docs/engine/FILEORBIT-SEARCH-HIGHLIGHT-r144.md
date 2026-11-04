# Search-result folder highlighting — r144

## Search membership
`searchTree()` computes `folderIds` during its single authoritative walk:
- all matches are evaluated before the result-card cap;
- a matching folder is included;
- every parent is followed through the canonical parent map to the structural root;
- full matching set beyond `MAX_SEARCH_RESULTS` still contributes ancestors;
- no per-folder subtree rescans and no tree mutation.

## Presentation
- Matching ancestor folders (including the structural root) receive red fill and stroke.
- Dark: `#7F1D1D` fill / `#FCA5A5` stroke; Light: `#B91C1C` fill / `#7F1D1D` stroke.
- A dashed red non-color outline is drawn outside each highlighted folder.
- Unrelated folders and all data nodes retain their theme colors.
- Selection is drawn after highlighting as the existing solid indigo ring, so selected highlighted folders remain distinguishable.
- A visually hidden `#search-highlight-status` polite status announces the number of highlighted folders.

Highlighting is a per-draw presentation derived from `searchHighlightIds`; no node metadata or colors are persisted. It is applied to normal drawing, navigation transitions, theme redraws, viewport redraws, and current-dataset installs. Candidate datasets do not inherit the current highlight set.

## Update lifecycle
- Query changes, edits, reparent, Undo/Redo, rename: search reruns from authoritative tree/data revision.
- Dataset replacement/recovery resets both query and highlight state.
- Empty query or no matches clears highlights and redraws.
- Closing Search leaves query and highlighting active; reopening preserves them.
- Stale search work is synchronous against the current tree/dataset, and reset invalidates state on replacement.

## Embed status (confirmed r144)
- `#embed-action` remains `data-available="false"`, `aria-disabled="true"`.
- No implemented Embed action/hosting/upload/publishing exists.
- Unavailable activation reports: “Embed requires shareable map hosting and is not available yet.”
- No iframe, localhost, local-file, or blob embed was added.

Future Embed prerequisites:
1. A distributable read-only viewer independent of the local write/IndexedDB runtime.
2. A deliberate map and attachment sharing model: stable share identity, access policy, privacy/revocation, hosting/URL ownership, and sandbox/CSP posture for embedded content.

## Verification
- Search/render/navigation/theme focused tests: 46/46.
- Full engine: 1107 tests, 1106 passed, 1 skipped, 0 failed.
- Browser: actual F20 search “Node 15” highlights n0/n1/n3/n7 in dark and light; screenshots available.
- Exact archive focused: 29/29.
- Native checks: NOT RUN.
