import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
test('actual open Map/More menus re-clamp on resize, preserve focus/scroll, and close safely', () => {
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, MENU_RESIZE: '1' } });
  assert.equal(result.status, 0);
});
