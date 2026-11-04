import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
function run(extra) {
  return spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, P1B: '1', RECOVERY_STARTUP: '1', ...extra } });
}
for (const [name, env] of [
  ['no candidate leaves normal empty startup', { RECOVERY_EMPTY: '1' }],
  ['candidate shows startup recovery dialog', {}],
  ['Recover cancelled by Create preserves source and claim', { RECOVERY_CANCEL_RECOVER: '1' }],
  ['Discard cancelled before transaction preserves source and claim', { RECOVERY_CANCEL_DISCARD: '1' }],
  ['Discard cancelled after transaction start may complete (documented boundary)', { RECOVERY_DISCARD_STARTED_CANCEL: '1' }],
  ['Recover cancelled by Open File preserves source and claim', { RECOVERY_CANCEL_OPEN: '1' }],
  ['Recover cancelled by Import preserves source and claim', { RECOVERY_CANCEL_IMPORT: '1' }],
  ['Later preserves candidates and accounting', { RECOVERY_LATER: '1' }],
  ['Escape preserves candidates and accounting', { RECOVERY_ESCAPE: '1' }],
  ['Discard removes only the selected copy', { RECOVERY_DISCARD: '1' }],
  ['Discard leaves another candidate intact', { RECOVERY_DISCARD: '1', RECOVERY_MULTI: '1' }],
  ['claimed candidate discard preserves data', { RECOVERY_DISCARD_CLAIMED: '1', RECOVERY_CLAIMED: '1' }],
  ['multiple candidates exact selection', { RECOVERY_MULTI: '1' }],
  ['failed child checkpoint preserves source and live work', { RECOVERY_CHILD_CP_FAIL: '1' }],
  ['replacement during adoption preserves B workspace and later checkpoint', { RECOVERY_CANCEL_AFTER_INSTALL: '1' }],
  ['destroy during recovery does not publish late', { RECOVERY_DESTROY: '1' }],
  ['recovered PDF opens in real viewer', { RECOVERY_PDF: '1' }],
  ['draw failure preserves source and releases resources', { RECOVERY_FAIL_DRAW: '1' }],
  ['label failure preserves source and releases resources', { RECOVERY_FAIL_LABEL: '1' }],
  ['hit failure preserves source and releases resources', { RECOVERY_FAIL_HIT: '1' }],
  ['starting Create prevents startup dialog interruption', { RECOVERY_WORKFLOW: '1' }]
]) {
  test(`actual main startup: ${name}`, () => { const result = run(env); assert.equal(result.status, 0); });
}










