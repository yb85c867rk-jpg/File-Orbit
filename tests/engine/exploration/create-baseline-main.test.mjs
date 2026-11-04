import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
test('creation establishes a zero-attachment recovery baseline before write and retires it on confirmed save', () => {
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, P1B: '1', CREATE_BASELINE: '1' } });
  assert.equal(result.status, 0);
});
