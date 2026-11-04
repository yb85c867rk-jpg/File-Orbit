import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('unavailable attachment activation shows explicit contextual feedback', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 60000, env: { ...process.env, ATTACHMENT_UNAVAILABLE_FEEDBACK: '1' } });
  assert.equal(result.status, 0);
});
