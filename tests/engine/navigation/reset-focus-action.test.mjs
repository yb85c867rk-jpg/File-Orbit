import test from 'node:test';
import assert from 'node:assert/strict';

import { executeResetFocus } from '../../harness/m5-adaptive-layout/reset-focus-action.mjs';

test('successful Reset focus publishes cleared focus and retained frame evidence', () => {
  const state = {
    requestedFocusId: 'n13',
    displayedFocusId: 'n13',
    framingMode: 'manual',
    frameEvidence: { projectionRadius: 2284.59, nodeCount: 200 }
  };
  const published = [];
  const result = executeResetFocus({
    prepare: () => ({ fitted: true }),
    fit: (_prepared, onInstalled) => {
      onInstalled();
      published.push({ ...state });
      return true;
    },
    getFocusState: () => state,
    setFocusState: (next) => Object.assign(state, next)
  });
  assert.equal(result.ok, true);
  assert.equal(published.length, 1);
  assert.equal(published[0].requestedFocusId, null);
  assert.equal(published[0].displayedFocusId, null);
  assert.equal(published[0].framingMode, 'fit');
  assert.deepEqual(published[0].frameEvidence, { projectionRadius: 2284.59, nodeCount: 200 });
});

test('failed installation does not publish a successful reset and retains prior request', () => {
  const state = { requestedFocusId: 'n13', displayedFocusId: 'n13', framingMode: 'manual' };
  const published = [];
  const result = executeResetFocus({
    prepare: () => ({ fitted: true }),
    fit: () => {
      published.push({ ...state });
      return false;
    },
    getFocusState: () => state,
    setFocusState: (next) => Object.assign(state, next)
  });
  assert.equal(result.ok, false);
  assert.equal(published.length, 1);
  assert.equal(published[0].requestedFocusId, 'n13');
  assert.equal(state.requestedFocusId, 'n13');
  assert.equal(state.displayedFocusId, 'n13');
});

test('preparation failure leaves focus state unchanged', () => {
  const state = { requestedFocusId: 'n13', displayedFocusId: 'n13', framingMode: 'manual' };
  const result = executeResetFocus({
    prepare: () => { throw new Error('bad base'); },
    fit: () => { throw new Error('must not run'); },
    getFocusState: () => state,
    setFocusState: (next) => Object.assign(state, next)
  });
  assert.equal(result.ok, false);
  assert.equal(state.requestedFocusId, 'n13');
  assert.equal(state.displayedFocusId, 'n13');
});
