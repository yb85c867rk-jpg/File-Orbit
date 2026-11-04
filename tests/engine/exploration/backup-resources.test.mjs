import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadResourceManager } from '../../harness/m5-exploration/backup-resources.js';

function harness() {
  const revoked = [];
  const timers = new Map();
  let nextTimer = 0;
  const manager = createDownloadResourceManager({
    revokeObjectUrl: (url) => revoked.push(url),
    schedule: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    cancelTimer: (id) => timers.delete(id),
    delayMs: 1000
  });
  return { manager, revoked, timers };
}

test('each download timer revokes only its own URL', () => {
  const { manager, revoked, timers } = harness();
  const a = manager.own({ url: 'blob:a' });
  const b = manager.own({ url: 'blob:b' });
  const [timerA, timerB] = [...timers.entries()];
  timerA[1]();
  assert.deepEqual(revoked, ['blob:a']);
  assert.equal(manager.size, 1);
  assert.equal(a.revoked, true); assert.equal(b.revoked, false);
  timerB[1]();
  assert.deepEqual(revoked, ['blob:a', 'blob:b']);
  assert.equal(manager.size, 0);
});

test('cleanup is idempotent and late timers cannot affect newer records', () => {
  const { manager, revoked, timers } = harness();
  const a = manager.own({ url: 'blob:a' });
  const b = manager.own({ url: 'blob:b' });
  const lateA = [...timers.values()][0];
  manager.cleanup(a);
  manager.cleanup(a);
  assert.deepEqual(revoked, ['blob:a']);
  manager.cleanupAll();
  assert.deepEqual(revoked, ['blob:a', 'blob:b']);
  lateA();
  assert.deepEqual(revoked, ['blob:a', 'blob:b']);
  assert.equal(manager.size, 0);
});
