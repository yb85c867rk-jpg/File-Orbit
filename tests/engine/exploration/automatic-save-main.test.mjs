import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
const settingsStart = html.indexOf('id="settings-panel"');
const settings = html.slice(settingsStart, html.indexOf('</div>', settingsStart) + 6);

test('Settings contains only Theme and document/save feedback is outside it', () => {
  assert.match(settings, /id="theme-action"/);
  assert.doesNotMatch(settings, /settings-save|Previous local maps|Fit graph|Storage &amp; backup help|document-name|save-state/);
  assert.match(html, /id="document-feedback"[^>]*hidden[\s\S]*?id="save-state"/);
  assert.match(html, /id="document-feedback"[^>]*aria-hidden="true"/);
  assert.match(html, /id="save-feedback"[\s\S]*?id="save-feedback-retry"[\s\S]*?id="save-feedback-save-as"/);
  assert.doesNotMatch(html, /id="orbit-action"|id="orbit-open"|orbit-folder-remnant/);
});

test('automatic save without a writable destination requires explicit Save As and does not auto-download', () => {
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 90000, env: { ...process.env, P1B: '1', AUTO_NO_DEST: '1' } });
  assert.equal(result.status, 0);
});
test('automatic external conflict Cancel keeps feedback, Retry resolves, replacement invalidates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-r2-'));
  const marker = join(dir, 'marker.txt');
  try {
    const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 45000, env: { ...process.env, P1B: '1', AUTO_CONFLICT: '1', LIFECYCLE_MARKER_FILE: marker } });
    assert.equal(result.status, 0);
    assert.equal(readFileSync(marker, 'utf8').trim(), 'AUTO_CONFLICT_R2_COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
