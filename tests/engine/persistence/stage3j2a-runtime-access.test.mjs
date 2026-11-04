import test from 'node:test'; import assert from 'node:assert/strict'; import { createPcRuntimeAccess } from '../../../src/app/pc/runtime-access.js';
test('Stage 3J-2A runtime access reads authoritative live state and owns operations', () => {
  let tree = { id: 'a' }; let registry = { id: 'r' }; let revision = 3; let history = { undo: [], redo: [] }; let disposed = null; let moved = null;
  const access = createPcRuntimeAccess({ getTree: () => tree, getRegistry: () => registry, getRevision: () => revision, getHistory: () => history, advanceRevision: () => ++revision, historyMove: (direction) => { moved = direction; return { ok: true, direction }; }, buildSnapshot: (options) => ({ ...options, liveTree: tree }), disposeRuntime: (runtime) => { disposed = runtime; } });
  assert.equal(access.tree(), tree); assert.equal(access.registry(), registry); assert.equal(access.revision(), 3);
  tree = { id: 'b' }; registry = { id: 's' }; assert.equal(access.tree(), tree); assert.equal(access.registry(), registry); assert.equal(access.state().revision, 3);
  access.advanceRevision(); assert.equal(access.revision(), 4); assert.equal(access.move('undo').direction, 'undo'); assert.equal(moved, 'undo');
  assert.deepEqual(access.snapshot({ capturedRevision: access.revision() }), { capturedRevision: 4, tree, registry, liveTree: tree });
  const runtime = { dispose() {} }; access.dispose(runtime); assert.equal(disposed, runtime);
  assert.throws(() => createPcRuntimeAccess({}), /live state/);
});


