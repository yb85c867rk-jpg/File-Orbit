import { findNodeWithParent } from './validation.js';

export function countDeleteSubtree(node) {
  let folders = 0; let files = 0;
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (current.kind === 'folder') folders += 1; else files += 1;
    for (const child of current.children || []) stack.push(child);
  }
  return { folders, files };
}
/** Shared explicit-target resolver for Delete request and confirmation submission. */
export function resolveDeleteTarget({ tree, target, action, structuralRootId }) {
  if (!target || typeof target.id !== 'string') return { ok: false, reason: 'stale-editor-target' };
  if (target.id === structuralRootId) return { ok: false, reason: 'root-protected', id: target.id };
  const found = findNodeWithParent(tree, target.id);
  if (!found || !found.parent) return { ok: false, reason: 'stale-id', id: target.id };
  const expectedKind = action === 'delete-folder' ? 'folder' : 'file';
  if (found.node.kind !== expectedKind) return { ok: false, reason: 'action-kind-mismatch', id: target.id };
  return { ok: true, found, counts: countDeleteSubtree(found.node), expectedKind, parentId: found.parent.id };
}
