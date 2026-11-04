import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
test('actual connected Orbit menu toggles, preserves drafts, and opens a listed map without a close action', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fileorbit-orbit-menu-'));
  const marker = join(dir, 'complete.txt');
  try {
    const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 45000, env: { ...process.env, P1B: '1', ORBIT_MENU: '1', LIFECYCLE_MARKER_FILE: marker } });
    assert.equal(result.status, 0);
    assert.equal(readFileSync(marker, 'utf8').trim(), 'ORBIT_MENU_COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
