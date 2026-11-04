import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(mode) {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-copy-encoding-'));
  const marker = join(dir, 'complete.txt');
  try {
    const result = spawnSync(process.execPath, [runner], {
      stdio: 'inherit', timeout: 60000,
      env: { ...process.env, P1B: '1', COPY_MAP_ENCODE: '1', COPY_MAP_ENCODE_MODE: mode, LIFECYCLE_MARKER_FILE: marker }
    });
    assert.equal(result.status, 0);
    assert.equal(readFileSync(marker, 'utf8').trim(), `COPY_MAP_ENCODE_${mode.toUpperCase()}_COMPLETE`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('deferred encoding rejection after session replacement preserves replacement feedback and document', () => run('session'));
test('deferred encoding rejection after destroy stays destroyed without publishing copy feedback', () => run('destroy'));
test('deferred encoding success after session replacement creates no destination and preserves replacement document', () => run('success'));
test('current-request encoding rejection still reports the copy preparation error', () => run('current'));
