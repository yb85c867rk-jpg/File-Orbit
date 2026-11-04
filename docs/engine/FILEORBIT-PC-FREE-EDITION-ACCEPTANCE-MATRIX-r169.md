# FileOrbit PC free-edition acceptance matrix — r169

Status legend: **PASS** = evidence supports the stated scope; **PASS-U** = user-reported actual PC observation, not independently observed; **NOT RUN** = no evidence; **LIMITATION** = documented scope/evidence gap; **N/A** = outside PC free-edition scope.

| ID | PC requirement | Automated evidence | Browser automation | Actual PC / user-reported evidence | Disposition |
|---|---|---|---|---|---|
| C0 | Final packet self-contained vendor | `vendor/jit` hashes included in final packet; extracted ENOENT fixed; final focused smoke 33/33 | n/a | n/a | **PASS packaging correction** |
| C1 | Candidate source/test identity | Source manifest 378 files including vendor, aggregate `B383D2…`; r169 extracted source/tests 374 files plus unchanged vendor, 0 missing/extra/hash differences | n/a | n/a | **PASS** |
| C2 | r169 archive integrity | Archive SHA `43311D…`; 3,053 files; manifest 0 mismatches | n/a | n/a | **PASS**, but archive omitted vendor |
| S1 | 300-node map save/reopen; node/content preservation | 300/301 boundary and save/reopen tests | Prior browser audit 300-node lifecycle | **PASS-U** earlier desktop; exact build not recorded | **PASS-U for visual preservation**; native hash/ID/topology equality NOT RUN |
| S2 | Save As cancellation | Save As/picker lifecycle tests | Prior browser picker emulation | **PASS-U** earlier desktop | **PASS-U** |
| S3 | Chrome–Edge external-change detection | Conflict tests | Browser conflict tests | **PASS-U** earlier desktop | **PASS-U** |
| S4 | Conflict Cancel keeps saved version and other window’s edits | Conflict-cancel tests | Browser conflict tests | **PASS-U** earlier desktop | **PASS-U**; native byte/hash equality NOT RUN |
| S5 | Repeated editor conflict cancellation keeps Retry Save / Save As / Close | Editor conflict tests | n/a | **PASS-U** earlier desktop | **PASS-U** |
| S6 | 301-node rejection shows limit and preserves 300 map/file | `free-edition-audit.test.mjs`; 300/301 tests | Prior browser limit audit | **PASS-U** earlier desktop | **PASS-U**; native file-hash equality NOT RUN |
| S7 | Browser restart then reopen/content preservation | Persistence/restart tests | Prior browser restart recovery audit | **PASS-U** earlier desktop | **PASS-U**; native ID/hash/topology equality NOT RUN |
| S8 | Unsaved-work recovery after restart, attachments, Save As/reopen recovered copy, original preserved | Recovery/backup tests | Prior browser recovery audit | **PASS-U** earlier desktop | **PASS-U**; native attachment byte/hash equality NOT RUN |
| W1 | r166 conflict wording and picker labels | Static/dialog tests | Browser dialog/picker-option assertions | **PASS-U** r166 request; exact build not recorded | **PASS-U** |
| R1 | Search results, red containing-folder highlights, navigation/details, changed-query updates, reset, no-results | Search/highlight tests | Prior browser search audit | **PASS-U** explicitly requested on r169 | **PASS-U** |
| R2 | Folder dragging, connection/selection alignment, background deselection, Undo/Redo, repeated interaction | Drag/reparent/history tests | Prior browser drag audit | **PASS-U** explicitly requested on r169 | **PASS-U** |
| R3 | Text/Korean/line breaks, PDF display/page navigation, images, repeated preview open/close, subsequent map interaction | Preview/attachment tests; corrected PDF fixture tests | r150 browser PDF/page/image evidence | **PASS-U** explicitly requested on r169 | **PASS-U** |
| R4 | Direct file open, folder connection without replacement, sidebar switching, Refresh, standalone files, picker cancellation | Opening/Orbit tests | Prior browser opening audit | **PASS-U** explicitly requested on r169 | **PASS-U** |
| L1 | Free node cap = 300 including root | `free-edition-audit.test.mjs`; 300/301 editor tests | Prior 299-file+root and 301 rejection audit | **PASS-U** visual 301 rejection | **PASS** (automated); native count PASS-U |
| L2 | Attachment cap = 20 MiB/file | `free-edition-audit.test.mjs` equality/one-byte-over; attachments tests | r148 20 MiB exact and 20 MiB+1 rejected | Native large-file picker NOT RUN | **PASS automated/browser**; native NOT RUN |
| L3 | Attachment total cap = 100 MiB | Backup/persistence total-limit tests | Native 100 MiB selection NOT RUN | NOT RUN | **PASS automated**; native **LIMITATION** |
| L4 | Malformed/truncated/hash-mismatched files rejected | Backup/persistence tests | Prior browser invalid-file audit | Native malformed picker NOT RUN | **PASS automated**; native NOT RUN |
| L5 | Root/edit restrictions | Editor validation/root tests | n/a | Not separately reported | **PASS automated**; native NOT RUN |
| L6 | Save/recovery/write failure preserves data | P1B/auto-save/recovery/write-failure tests | Prior browser failure audit | Native quota/disk failure NOT RUN | **PASS automated**; native NOT RUN |
| F1 | Transient bottom-notice dismissal ~3 s | Feedback-expiry test | Browser timing evidence r164 | No manual 3-s stopwatch result supplied | **PASS automated only** |
| N1 | Native file SHA-256 equality, attachment SHA-256 equality, node-ID equality, topology equality | Automated fixtures compare these | n/a | User confirmed content visually, not hashes/IDs | **NOT RUN native** — documented evidence gap, not marked PASS |
| N2 | Native File System Access picker/write/close behavior | Synthetic adapter tests | Browser stub/picker-option tests | Save/reopen user-reported, but no picker/write trace | **PASS-U workflow**; native low-level trace NOT RUN |
| N3 | Native multi-tab storage contention / quota exhaustion | FakeIndexedDB concurrency test skipped | NOT RUN | NOT RUN | **LIMITATION**, native unverified |
| P1 | PC browser scope | n/a | Headless Chromium 156 | Chrome/Edge user-reported; Edge exact version not recorded | **PASS-U** for Chrome/Edge workflow; Firefox/Safari PC NOT RUN |
| P2 | Deferred tablet | n/a | n/a | n/a | **N/A / deferred** |
| P3 | Phones | n/a | n/a | Paused; actual iPhone HTTP encoding issue unresolved | **N/A for PC; paused mobile risk** |
| P4 | Paid 1,000-node / Upgrade | n/a | n/a | n/a | **N/A future work** |

## Matrix interpretation

- “PASS-U” never implies hash, ID, topology, or byte equality; those are explicitly separate **NOT RUN** native rows.
- Automated integrity checks cover hashes/IDs/topology on synthetic fixtures.
- Native visual/content preservation is accepted only as user-reported evidence.
- No known functional PC defect is recorded in this packet.
