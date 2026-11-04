import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('actual search input highlights and updates folder ancestry', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-search-highlight-')); const marker = join(dir, 'complete.txt');
  try { const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 45000, env: { ...process.env, P1B: '1', SEARCH_HIGHLIGHT: '1', LIFECYCLE_MARKER_FILE: marker } }); assert.equal(result.status, 0); assert.equal(readFileSync(marker, 'utf8').trim(), 'SEARCH_HIGHLIGHT_COMPLETE'); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
