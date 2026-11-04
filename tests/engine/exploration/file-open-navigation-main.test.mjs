import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
const indexHtml = fileURLToPath(new URL('../../harness/m5-exploration/index.html', import.meta.url));

function run(env, markerText) {
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-open-nav-'));
  const marker = join(dir, 'complete.txt');
  try {
    const result = spawnSync(process.execPath, [runner], {
      stdio: 'inherit', timeout: 90000,
      env: { ...process.env, P1B: '1', LIFECYCLE_MARKER_FILE: marker, ...env }
    });
    assert.equal(result.status, 0);
    assert.match(readFileSync(marker, 'utf8'), new RegExp(markerText));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('production navigation removes primary Save/Open Orbit and keeps Settings theme-only', () => {
  const html = readFileSync(indexHtml, 'utf8');
  assert.doesNotMatch(html, /id="orbit-action"/);
  assert.doesNotMatch(html, /id="orbit-open"/);
  assert.equal((html.match(/data-action="save-map"/g) || []).length, 0);
  assert.match(html, /id="settings-panel"[\s\S]*?id="theme-action"/);
  assert.doesNotMatch(html, /id="settings-save"|Previous local maps|Fit graph|Storage &amp; backup help/);
  assert.match(html, /id="settings-panel"[\s\S]*?id="theme-action"/);
  assert.match(html, /id="orbit-refresh"[^>]*>Refresh list/);
  assert.doesNotMatch(html, /id="orbit-close"|id="orbit-add"/);
  assert.match(html, /id="copy-map"[^>]*aria-label="Copy Map"/);
  assert.match(html, /id="orbit-toggle"[^>]*aria-controls="orbit-panel"/);
  assert.ok(html.indexOf('id="orbit-toggle"') > html.indexOf('data-action="save-document-as"'));
  assert.ok(html.indexOf('id="orbit-toggle"') < html.indexOf('id="settings-action"'));
});

