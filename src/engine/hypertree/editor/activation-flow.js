import { createEditorAction, normalizeEditorAction, normalizeEditorTarget } from './target.js';
import { validateEditorMenuTarget } from './activation.js';

/** Shared menu→form coordinator used by the harness and integration tests. */
export function chooseEditorAction({
  action,
  target,
  editorController,
  graph,
  visibleSet,
  datasetToken,
  baseRevision,
  getDetails,
  openAction = null,
  openEditor = null,
  requestPrompt = () => {},
  onDiagnostic = () => {}
}) {
  const canonical = normalizeEditorAction({ ...target, action });
  if (!canonical) {
    onDiagnostic({ reason: 'invalid-editor-action', id: target?.id ?? target?.targetId ?? null });
    return { ok: false, reason: 'invalid-editor-action' };
  }
  const checked = validateEditorMenuTarget({
    target: canonical, datasetToken, baseRevision, graph, visibleSet
  });
  if (!checked.ok) {
    onDiagnostic({ reason: checked.reason, id: canonical.id });
    return { ok: false, reason: checked.reason };
  }
  let details = getDetails(canonical.id);
  if (!details || details.kind !== canonical.hitKind) {
    onDiagnostic({ reason: 'stale-editor-target', id: canonical.id });
    return { ok: false, reason: 'stale-editor-target' };
  }
  let operationTarget = canonical;
  if (canonical.action === 'add-folder' || canonical.action === 'add-data') {
    if (canonical.hitKind !== 'folder') return { ok: false, reason: 'action-kind-mismatch' };
  } else if (canonical.action === 'edit-data' || canonical.action === 'edit-details') {
    if (canonical.hitKind !== 'file') return { ok: false, reason: 'action-kind-mismatch' };
  } else if (canonical.action === 'edit-folder' || canonical.action === 'edit-description') {
    if (canonical.hitKind !== 'folder') return { ok: false, reason: 'action-kind-mismatch' };
  } else if (canonical.action === 'delete-folder' || canonical.action === 'delete-data') {
    return { ok: false, reason: 'delete-unavailable' };
  }
  const open = editorController?.isOpen();
  const same = open && editorController.targetId === operationTarget.id && editorController.action === canonical.action;
  if (open && !same && (editorController.dirty || editorController.mode === 'confirm-replace')) {
    const pending = createEditorAction({
      action: canonical.action, id: operationTarget.id, hitKind: operationTarget.hitKind, name: details.name,
      datasetToken, baseRevision
    });
    requestPrompt(pending);
    return { ok: true, action: 'prompt', pending };
  }
  const openForm = openAction || ((value) => openEditor(value));
  if (!openForm) {
    onDiagnostic({ reason: 'missing-open-adapter', id: canonical.id });
    return { ok: false, reason: 'missing-open-adapter' };
  }
  const opened = openForm(details, canonical.action);
  if (!opened?.ok) {
    onDiagnostic({ reason: 'editor-action-open-failed', id: canonical.id });
    return { ok: false, reason: 'editor-action-open-failed' };
  }
  return { ok: true, action: 'open', target: canonical };
}

export function chooseEditorTarget(options) {
  return chooseEditorAction({ ...options, action: 'rename' });
}

export function resumeEditorAction(options) {
  return chooseEditorAction({
    ...options,
    action: options.target?.action ?? options.action,
    target: normalizeEditorTarget(options.target)
  });
}

export function resumeEditorTarget(options) {
  return resumeEditorAction({ ...options, action: 'rename' });
}

/** Open the menu from an explicitly supplied contextmenu event. */
export function openEditorMenu({ target, event, openMenu }) {
  if (!event || event.type !== 'contextmenu') return false;
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
  const canonical = normalizeEditorTarget(target);
  if (!canonical) return false;
  return openMenu({ target: { ...canonical, isRoot: Boolean(target.isRoot) }, x: event.clientX, y: event.clientY }) === true;
}
