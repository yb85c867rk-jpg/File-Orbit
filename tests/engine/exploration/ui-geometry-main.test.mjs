import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
test('actual main geometry keeps canvas and Fit inside the drawable region and aligns drag coordinates', () => {
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, P1B: '1', UI_GEOMETRY: '1' } });
  assert.equal(result.status, 0);
});
