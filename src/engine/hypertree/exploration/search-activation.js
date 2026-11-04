export function findSearchTarget(tree, id) {
  let result = null;
  const walk = (node, parent, path) => {
    if (result) return;
    if (node.id === id) { result = { node, parent, path }; return; }
    for (const child of node.children || []) walk(child, node, path ? `${path} / ${node.name}` : node.name);
  };
  if (tree) walk(tree, null, '');
  return result;
}

export function validateSearchActivation({ tree, id, datasetToken, revision, expectedDatasetToken = null, expectedRevision = null }) {
  if (typeof id !== 'string' || id.length === 0) return { ok: false, reason: 'invalid-id', message: 'The result no longer has a valid identity.' };
  if (expectedDatasetToken !== null && expectedDatasetToken !== datasetToken) return { ok: false, reason: 'stale-dataset', message: 'The map changed. Search again.' };
  if (expectedRevision !== null && expectedRevision !== revision) return { ok: false, reason: 'stale-revision', message: 'The map changed. Search again.' };
  const found = findSearchTarget(tree, id);
  if (!found) return { ok: false, reason: 'missing-target', message: 'The result no longer exists.' };
  return { ok: true, node: found.node, parent: found.parent, path: found.path };
}

/** Await actual navigator completion for a search reveal, never a fixed timeout. */
export function createSearchNavigationWaiter() {
  let pending = null;
  const clear = () => { pending = null; };
  return {
    get pending() { return pending; },
    begin({ folderId, targetId, parentId, datasetToken, revision }) {
      if (pending) return { ok: false, reason: 'busy', message: 'A search reveal is already in progress.' };
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      pending = { folderId, targetId, parentId, datasetToken, revision, promise, resolve, reject };
      return { ok: true, promise };
    },
    settle(folderId, { ok, error = null } = {}) {
      if (!pending || pending.folderId !== folderId) return false;
      const current = pending; clear();
      if (ok) current.resolve({ ok: true, ...current });
      else current.reject(error || new Error('Navigation failed.'));
      return true;
    },
    cancel(reason = 'cancelled') { if (!pending) return false; const current = pending; clear(); current.reject(new Error(reason)); return true; },
    clear
  };
}
