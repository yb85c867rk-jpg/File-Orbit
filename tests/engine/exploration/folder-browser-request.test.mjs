import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRequestIsCurrent } from '../../harness/m5-exploration/browser-request.js';
const base = { dialogOpen: true, request: 4, currentRequest: 4, session: 2, dataset: 7, sequence: 9, currentSequence: 9, currentSession: 2, currentDataset: 7, dialogOwns: true };
test('browser request ownership rejects close/reopen, newer listing, and dataset/session replacement', () => {
  assert.equal(browserRequestIsCurrent(base), true);
  assert.equal(browserRequestIsCurrent({ ...base, dialogOpen: false }), false);
  assert.equal(browserRequestIsCurrent({ ...base, currentRequest: 5 }), false, 'reopened dialog owns a newer request');
  assert.equal(browserRequestIsCurrent({ ...base, currentSequence: 10 }), false, 'newer listing owns busy state');
  assert.equal(browserRequestIsCurrent({ ...base, currentSession: 3 }), false, 'document replacement invalidates');
  assert.equal(browserRequestIsCurrent({ ...base, currentDataset: 8 }), false, 'dataset replacement invalidates');
  assert.equal(browserRequestIsCurrent({ ...base, dialogOwns: false }), false);
});
