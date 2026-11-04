import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Open Orbit opens a standalone file directly; Connect Folder is separate and non-destructive', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], {
    stdio: 'inherit', timeout: 120000,
    env: { ...process.env, OPEN_WORKFLOW: '1', P1B: '1' }
  });
  assert.equal(result.status, 0);
});
