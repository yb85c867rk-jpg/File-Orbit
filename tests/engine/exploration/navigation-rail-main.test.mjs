import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
test('actual rail expand/settings/theme/local maps, .orbit download, unified Open and help preserve lifecycle', () => {
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, P1B: '1', NAV_RAIL: '1' } });
  assert.equal(result.status, 0);
});
