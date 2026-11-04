# FileOrbit Search — Slice 3

Status: **IMPLEMENTED; browser-native verification NOT RUN**

## Search contract

- Searches the entire authoritative tree, including branches hidden by exploration scope.
- Fields: node name and optional `data.description`.
- Matching: NFC-normalized, lowercase, trimmed literal query.
- Multiword: whitespace-separated terms are ANDed across the combined name+description text.
- Ranking: exact name, name prefix, other name match, description-only; tie by normalized name then stable ID.
- Query maximum: 200 code points; field `maxlength=200`.
- Result cap: 50 cards; total match count and explicit limit message retained.
- No graph visibility change on typing. No content parsing, network, regex, or dependencies.

## Result cards and content

- Dedicated right-panel section; editor form subtree is untouched.
- Cards use safe textContent construction, full name, bounded description excerpt, type, existing icon, optional parent path.
- Web-link cards expose a validated explicit “Open website” link; card activation never auto-opens it.
- Folder result shows full details; supported file result opens the existing viewer after successful reveal/selection; unsupported/missing attachment uses the existing viewer state.
- Clear search and Back to results preserve graph focus/camera and do not mutate the map.

## Activation/reveal ownership

- Cards carry stable ID, dataset token, and revision from the rendering snapshot.
- Activation revalidates dataset/revision/target/parent/kind against the current tree.
- Visible data selects through the shared session; hidden data navigates to its authoritative parent via the shared navigator.
- Transition reveal awaits actual navigator settlement through `createSearchNavigationWaiter`; no timeout is used.
- Completion revalidates dataset/revision/parent/installed visibility before selection/content.
- Dirty editor prompts Continue editing / Discard changes; Discard resumes one semantic search action without pointer coordinates.
- Busy modal, Create Map ownership, recovery failure, saving, drag, transition, viewer, and Delete ownership block activation with feedback.
- Stale/deleted results refresh the active query and never act on obsolete parent/kind data.
- Dataset replacement clears query/results/pending reveal; mutations preserve the query and recompute from committed data; search never increments revision or history.

## Corrections

- Search cards reuse the authoritative presentation resolver for visible type labels: Folder, Web link, PDF, Markdown, Text, Image, File, or Unknown/review. Stored classification overrides renamed extensions.
- Actual main-entry subprocess coverage now creates a map containing a Markdown attachment and a sibling folder, navigates away, searches the hidden Markdown, completes parent reveal and selection, and opens/closes the real attachment viewer.

## Verification

- Full `tests/engine`: **686/686 pass**.
- Editor: **183/183**.
- Render: **91/91**.
- Interaction: **30/30**.
- Exploration: **155/155**.
- Actual main entry: search input → rendered card → activation; hidden data reveal/selection; clear preserves camera.
- Browser-native verification: **NOT RUN**.


