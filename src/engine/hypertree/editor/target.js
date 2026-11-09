export const EDITOR_TARGET_KIND = 'editor-target';
export const EDITOR_ACTION_KIND = 'editor-action';
export const EDITOR_ACTIONS = Object.freeze(['rename', 'add-folder', 'add-data', 'edit-folder', 'edit-data', 'edit-details', 'edit-description', 'delete-folder', 'delete-data']);

function requireKind(value) {
  if (value !== 'folder' && value !== 'file') throw new Error('editor target hitKind must be folder or file');
}
function requireIdentity(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`editor target ${label} must be a nonnegative safe integer`);
}

/** Canonical editor target used by menu targets, pending intents, and form open. */
export function createEditorTarget({ id, hitKind, name = null, datasetToken, baseRevision }) {
  if (typeof id !== 'string' || id.length === 0) throw new Error('editor target id must be a non-empty string');
  requireKind(hitKind);
  requireIdentity(datasetToken, 'datasetToken');
  requireIdentity(baseRevision, 'baseRevision');
  return Object.freeze({ kind: EDITOR_TARGET_KIND, id, hitKind, name, datasetToken, baseRevision });
}

export function normalizeEditorTarget(value) {
  if (!value || typeof value !== 'object') return null;
  const id = value.id ?? value.targetId;
  try {
    return createEditorTarget({
      id,
      hitKind: value.hitKind,
      name: value.name ?? null,
      datasetToken: value.datasetToken,
      baseRevision: value.baseRevision
    });
  } catch {
    return null;
  }
}

export function isEditorTarget(value) {
  return Boolean(value && value.kind === EDITOR_TARGET_KIND);
}
/** Canonical semantic editor action, used for dirty replacement intents. */
export function createEditorAction({ action, id, hitKind, name = null, datasetToken, baseRevision }) {
  if (!EDITOR_ACTIONS.includes(action)) throw new Error('unsupported editor action');
  const target = createEditorTarget({ id, hitKind, name, datasetToken, baseRevision });
  return Object.freeze({ ...target, kind: EDITOR_ACTION_KIND, action });
}

export function normalizeEditorAction(value) {
  if (!value || typeof value !== 'object') return null;
  const target = normalizeEditorTarget(value);
  if (!target) return null;
  const action = value.action ?? 'rename';
  if (!EDITOR_ACTIONS.includes(action)) return null;
  return Object.freeze({ ...target, kind: EDITOR_ACTION_KIND, action });
}

export function isEditorAction(value) {
  return Boolean(value && value.kind === EDITOR_ACTION_KIND && EDITOR_ACTIONS.includes(value.action));
}



