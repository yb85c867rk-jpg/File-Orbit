# FileOrbit variation 06 branding — r138

## Approved source

- Supplied image: `exec-dc0bcb66-4c68-412f-97a3-e0c3e4fa6228.png`
- Dimensions: 1254×1254
- SHA-256: `8B82AE4114D6F99D81A5A3E5797500A1E7D70B5E1A4D8AC510066E245FF4A23E`
- Local reference copy: `evidence/branding/variation-06-reference.png` (byte-identical)

The image is labeled **06** and contains the approved design: indigo F at upper left, open navy O at lower right, lavender connection nodes at upper right and lower left, plus the FileOrbit wordmark. No later app-icon alternative or invented mark was used.

The supplied PNG is RGB with an opaque off-white background, not transparent alpha. The exact symbol crop preserves that supplied background rather than inventing a transparency treatment.

## Project-local assets

| Asset | Dimensions | SHA-256 |
| --- | --- | --- |
| `assets/fileorbit-mark.png` (symbol crop, source box x=373..886, y=296..775) | 514×480 | `4DF9850BE98A4D48F058E335C002F2247CED9AC9DA89249B585D75E755939C3B` |
| `assets/fileorbit-favicon-16.png` | 16×16 | `F15633E7086CECC7FE16C93A34D229D9FB4F7F22E82488863221BE7566F2038E` |
| `assets/fileorbit-favicon-32.png` | 32×32 | `2DAA31FB223FFC071B85CB79FDB2D3DDA594309AFF4B65A80703557297BE9966` |
| `assets/fileorbit-favicon-48.png` | 48×48 | `595463A47140B3DF7871BE1C9618C856168C714D929A0DF3BC86B8251ADB7DAF` |
| `assets/fileorbit-favicon-64.png` | 64×64 | `E686CBB2695FC67950246C2FE96163120F603C872CA739B037558186537842F1` |
| `assets/fileorbit-favicon.ico` (16/32/48) | multi-size | `CB24C55D5C5E1A3FCF3A34F1A40BC013D7238C88084065A6F34AB888CFF2D74A` |

Favicons are proportional derivatives of the same symbol with transparent-safe centering padding; no clipping or recoloring.

## Header and tab

- Header now contains only the local mark at explicit `width="28" height="26"` (CSS height 26, width auto; rendered 27.8×26) with `alt="FileOrbit"`.
- Header height remains **32px** at desktop and narrow widths; `#graph-wrap`/workspace top remains **32px**. No additional header controls; logo has no navigation behavior.
- The mark sits on its supplied off-white background, providing clear contrast with both dark and light header themes.
- Page title is exactly **FileOrbit**; the `M5 Exploration` harness wording is removed.
- Local relative favicon links reference the ICO/32/16 assets.

## Verification

- Branding/header/navigation focused suites: 36/36 passed.
- Full engine: 1102 tests, 1101 passed, 1 skipped, 0 failed.
- Browser inspection: dark/light desktop and dark/light narrow screenshots; logo loaded from local asset, favicon links all returned HTTP 200, title `FileOrbit`, header 32px, graph workspace top 32px, no horizontal overflow.
- Native filesystem checks: **NOT RUN**; this task changes branding only.

All `.orbit`-only file handling and existing creation/Open/Save/Copy/autosave/recovery/ownership behavior is unchanged. No database reset, user-document modification, dependency installation, commit, push, deployment, server shutdown, or unrelated project change.
