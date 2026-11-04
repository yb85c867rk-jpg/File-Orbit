import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
test('actual main recovery baseline wiring', () => {
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, P1B: '1', RECOVERY_SLICE2: '1' } });
  assert.equal(result.status, 0);
});
test('Import Backup commits an immediate recovery baseline in the real main path', () => {
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, P1B: '1', RECOVERY_IMPORT: '1' } });
  assert.equal(result.status, 0);
});
