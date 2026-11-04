import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('only .orbit files are listed, opened, downloaded, and old extensions are rejected before replacement', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-orbit-only-')); const marker = join(dir, 'complete.txt');
  try {
    const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 60000, env: { ...process.env, P1B: '1', ORBIT_ONLY: '1', LIFECYCLE_MARKER_FILE: marker } });
    assert.equal(result.status, 0); assert.equal(readFileSync(marker, 'utf8').trim(), 'ORBIT_ONLY_COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
