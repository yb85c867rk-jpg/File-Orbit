# Stage 2B-1 cluster/focus prototype

Static analysis demo; not imported by the application.

Run:
```sh
python -m http.server 8130 --bind 127.0.0.1 --directory .
# open http://127.0.0.1:8130/analysis/stage2b1/index.html
node analysis/stage2b1/browser-evidence.mjs
```

The browser runner uses installed Microsoft Edge at its default Windows path and requires a local server on port 8130. Screenshots/raw measurements land in `analysis/stage2b1/evidence/`.

The application remains free-only at 300 nodes. The prototype never writes clusters to the document, persistence, or format.
