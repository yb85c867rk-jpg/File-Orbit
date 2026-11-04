import { encodeBackup } from '../../engine/hypertree/persistence/backup.js';
export function createPcRuntimeAccess({ getTree, getRegistry, getRevision, getHistory, advanceRevision, historyMove, buildSnapshot, disposeRuntime } = {}) {
  if (typeof getTree !== 'function' || typeof getRegistry !== 'function' || typeof getRevision !== 'function' || typeof getHistory !== 'function') throw new TypeError('Runtime access requires live state readers.');
  const stats = { tree: 0, registry: 0, revision: 0, history: 0, advance: 0, move: 0, snapshot: 0, encode: 0, dispose: 0 };
  function serializationState() { stats.tree += 1; stats.registry += 1; stats.revision += 1; return { tree: getTree(), registry: getRegistry(), revision: getRevision() }; }
  return Object.freeze({
    tree() { stats.tree += 1; return getTree(); },
    registry() { stats.registry += 1; return getRegistry(); },
    revision() { stats.revision += 1; return getRevision(); },
    history() { stats.history += 1; return getHistory(); },
    state() { return { ...serializationState(), history: (stats.history += 1, getHistory()) }; },
    serializationState,
    advanceRevision() { if (typeof advanceRevision !== 'function') throw new Error('Revision advancement is not configured.'); stats.advance += 1; return advanceRevision(); },
    move(direction) { if (typeof historyMove !== 'function') throw new Error('History movement is not configured.'); stats.move += 1; return historyMove(direction); },
    snapshot(options = {}) { if (typeof buildSnapshot !== 'function') throw new Error('Snapshot construction is not configured.'); stats.snapshot += 1; const live = serializationState(); return buildSnapshot({ ...options, tree: live.tree, registry: live.registry, capturedRevision: live.revision }); },
    async encode(options = {}) { stats.encode += 1; const { encodeBackup } = await import('../../engine/hypertree/persistence/backup.js'); return encodeBackup({ ...options, ...serializationState() }); },
    dispose(runtime) { stats.dispose += 1; if (typeof disposeRuntime === 'function') return disposeRuntime(runtime); if (runtime?.dispose) return runtime.dispose(); return undefined; },
    stats() { return { ...stats }; }
  });
}

