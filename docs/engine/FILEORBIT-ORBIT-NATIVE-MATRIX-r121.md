# FileOrbit Orbit Slice 6 native acceptance matrix (r121)

Status: **PARTIAL / BLOCKED**. No native filesystem row is PASS. No Slice 6 acceptance claim.

| Area | ID | Scenario | Result | Evidence |
|---|---|---|---|---|
| Selection/list | A1 | Open existing Orbit | BLOCKED | Headless browser; no native picker |
| Selection/list | A2 | Top-level `.map` only | BLOCKED | Requires native Orbit open |
| Selection/list | A3 | Refresh after external add/remove | BLOCKED | Requires native handle |
| Selection/list | A4 | Cancel another selection; preserve | BLOCKED | Native picker unavailable |
| Selection/list | A5 | Close Orbit; document remains | BLOCKED | Requires native Orbit |
| Create | B1 | Create named Orbit | BLOCKED | Parent picker unavailable |
| Create | B2 | Real directory exists | BLOCKED | Not created natively |
| Create | B3 | Title-only map; no per-map picker | BLOCKED | No native Orbit handle |
| Create | B4 | Reopen; one root | BLOCKED | No native write/reopen |
| Create | B5 | Populated map | BLOCKED | No native UI |
| Create | B6 | PDF/YAML attachments | BLOCKED | No native reopen |
| Collision | C1 | Duplicate filename | BLOCKED | No native save |
| Collision | C2 | Case-equivalent | BLOCKED | No native save |
| Collision | C3 | Zero-byte existing | BLOCKED | No native save |
| Collision | C4 | Hash unchanged; alternate/cancel | BLOCKED | No native save |
| Save | D1 | Protected Save | BLOCKED | No native handle |
| Save | D2 | Reopen actual edit/attachments | BLOCKED | No native reopen |
| Save | D3 | External modification conflict | BLOCKED | No native external write |
| Save | D4 | Cancel preserves both | BLOCKED | Native conflict UI unavailable |
| Save | D5 | Explicit overwrite | BLOCKED | Native conflict UI unavailable |
| Save | D6 | Save a Copy separate | BLOCKED | Native Save As unavailable |
| Save | D7 | Original destination rejected | BLOCKED | Native Save As unavailable |
| Save | D8 | Save As outside + protected Save | BLOCKED | Native Save As unavailable |
| Add | E1 | Standalone committed unsaved edit | BLOCKED | Native Open required |
| Add | E2 | Copy edit + exact attachments | BLOCKED | Native Orbit write required |
| Add | E3 | Original unchanged | BLOCKED | Native copy unavailable |
| Add | E4 | Copy not auto-opened | BLOCKED | Native copy unavailable |
| Add | E5 | Duplicate copy rejected | BLOCKED | Native copy unavailable |
| Editor/recovery | F1 | Editor Save destination | BLOCKED | Native document required |
| Editor/recovery | F2 | Dirty replacement Cancel | BLOCKED | Native Open required |
| Editor/recovery | F3 | Save and continue | BLOCKED | Native Open required |
| Editor/recovery | F4 | Recover then save/copy | BLOCKED | Native Orbit required |
| Editor/recovery | F5 | Recovery separate from file | BLOCKED | Native document required |
| Editor/recovery | F6 | Reload reauthorization | BLOCKED | No native Orbit |
| Layout | G1 | Desktop no overflow | PARTIAL PASS | Browser screenshot |
| Layout | G2 | Narrow 390 px no overflow | PARTIAL PASS | Browser screenshot |
| Layout | G3 | Rail/Details/theme | PARTIAL PASS | Browser UI screenshots |
| Layout | G4 | Drafts/tooltips/focus/fullscreen | NOT RUN | Requires native document |
| Layout | G5 | Reparent Undo/Redo; camera pan | NOT RUN | Requires native map |

Platforms: PC source/server/browser layout PASS; PC native filesystem BLOCKED; Android/iPhone/Firefox/Safari NOT RUN.

See [FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md](FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md) and `evidence/native-r121/`.
