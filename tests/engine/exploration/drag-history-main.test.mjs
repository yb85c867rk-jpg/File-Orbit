import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync as read, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
test('actual pointer drag, deferred automatic resume, and editor Cancel/Save coordination', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-r1-'));
  const marker = join(dir, 'marker.txt');
  try {
    const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 45000, env: { ...process.env, P1B: '1', DRAG_HISTORY: '1', LIFECYCLE_MARKER_FILE: marker } });
    assert.equal(result.status, 0);
    assert.equal(read(marker, 'utf8').trim(), 'AUTO_EDITOR_R1_COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
