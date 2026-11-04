import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('actual main Orbit navigation lists, opens with exact bytes, and protects saves', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], {
    stdio: 'inherit', timeout: 120000,
    env: { ...process.env, ORBIT_UI: '1', P1B: '1' }
  });
  assert.equal(result.status, 0);
});
