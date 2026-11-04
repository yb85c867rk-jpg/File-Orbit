import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('actual main entry initializes in an isolated process and opens Create Map', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [decodeURIComponent(runner)], { stdio: 'inherit', timeout: 120000 });
  assert.equal(result.status, 0);
});test('Create Map initialization failure keeps actions unavailable and publishes the original error', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, FAIL_CREATE_MAP_DIALOG: '1' } });
  assert.equal(result.status, 0);
});test('Create Map installation failure from empty startup returns to empty state with an error', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, FAIL_CREATE_INSTALL: '1' } });
  assert.equal(result.status, 0);
});test('Create Map cancellation restoration failure remains inert with the original error', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, FAIL_RESTORE: '1' } });
  assert.equal(result.status, 0);
});for (const mode of ['draw', 'resize', 'dataset']) {
  test(`normal-motion search reveal failure/cancellation mode: ${mode}`, () => {
    const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, MOTION_FAILURE: mode } });
    assert.equal(result.status, 0);
  });
}test('zero-sized graph viewport reports an error and allows retry when usable', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, ZERO_VIEWPORT: '1' } });
  assert.equal(result.status, 0);
});test('Create Map button lifecycle survives reuse, Back, double submit, and reopen', () => {
  const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, BUTTON_LIFECYCLE: '1' } });
  assert.equal(result.status, 0);
});

