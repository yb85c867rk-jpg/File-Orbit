import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Save a Copy cannot bypass disabled overwrite protection or impersonate a distinct copy', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-r2-'));
  const marker = join(dir, 'complete.txt');
  try {
    const result = spawnSync(process.execPath, [runner], {
      stdio: 'inherit', timeout: 90000,
      env: { ...process.env, ORBIT_R2: '1', P1B: '1', LIFECYCLE_MARKER_FILE: marker }
    });
    assert.equal(result.status, 0);
    assert.match(readFileSync(marker, 'utf8'), /ORBIT_R2_COMPLETE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
