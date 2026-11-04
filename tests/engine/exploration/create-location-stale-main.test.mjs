import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('cancelled map creation ignores late folder selection', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-create-stale-'));
  const marker = join(dir, 'complete.txt');
  try {
    const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 45000, env: { ...process.env, P1B: '1', CREATE_LOCATION_STALE: '1', LIFECYCLE_MARKER_FILE: marker } });
    assert.equal(result.status, 0);
    assert.equal(readFileSync(marker, 'utf8').trim(), 'CREATE_LOCATION_STALE_COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
