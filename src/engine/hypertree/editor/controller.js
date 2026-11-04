/** UI-agnostic E1/E2 editor draft and ownership state. */
export function createEditorController() {
  let mode = 'closed';
  let action = 'rename';
  let targetId = null;
  let originalDataType = null;
  let draftDataType = null;
  let originalName = '';
  let draftName = '';
  let originalDescription = null;
  let draftDescription = null;
  let originalLink = null;
  let draftLink = null;
  let error = null;
  let pendingIntent = null;
  let status = '';
  let saving = false;
  let dirty = false;
  let datasetToken = null;
  let baseRevision = null;

  const nameEditable = () => action === 'rename' || action === 'add-folder' || action === 'add-data' || action === 'edit-folder' || action === 'edit-data';
  function evaluateDirty() {
    return (nameEditable() && draftName !== originalName)
      || draftDescription !== originalDescription
      || draftLink !== originalLink;
  }
  function reset() {
    mode = 'closed';
    action = 'rename';
    targetId = null;
    originalName = '';
    draftName = '';
    originalDescription = null;
    draftDescription = null;
    originalLink = null;
    draftLink = null;
    error = null;
    pendingIntent = null;
    status = '';
    saving = false;
    dirty = false;
    datasetToken = null;
    baseRevision = null;
  }
  const isOpen = () => mode !== 'closed';
  const controller = {
    get mode() { return mode; },
    get action() { return action; },
    get targetId() { return targetId; },
    get originalDataType() { return originalDataType; },
    get draftDataType() { return draftDataType; },
    get originalName() { return originalName; },
    get draftName() { return draftName; },
    get originalDescription() { return originalDescription; },
    get draftDescription() { return draftDescription; },
    get originalLink() { return originalLink; },
    get draftLink() { return draftLink; },
    get error() { return error; },
    get pendingIntent() { return pendingIntent; },
    get status() { return status; },
    get saving() { return saving; },
    get dirty() { return dirty; },
    get datasetToken() { return datasetToken; },
    get baseRevision() { return baseRevision; },
    isOpen() { return isOpen(); },
    isSaving() { return saving; },
    canRequestSelection() { return mode === 'editing' || mode === 'confirm-replace'; },
    open({ id, action: nextAction = 'rename', name = '', description = null, link = null, dataType = null, datasetToken: token = null, baseRevision: revision = null }) {
      if (isOpen()) return false;
      if (typeof id !== 'string' || typeof name !== 'string') return false;
      if (!['rename', 'add-folder', 'add-data', 'edit-folder', 'edit-data', 'edit-details'].includes(nextAction)) return false;
      mode = 'editing';
      action = nextAction;
      datasetToken = token;
      baseRevision = revision;
      targetId = id;
      originalName = name;
      draftName = name;
      originalDescription = typeof description === 'string' ? description : null;
      draftDescription = originalDescription;
      originalLink = typeof link === 'string' ? link : null;
      draftLink = originalLink;
      originalDataType = dataType ?? null;
      draftDataType = originalDataType;
      error = null;
      pendingIntent = null;
      status = '';
      saving = false;
      dirty = false;
      return true;
    },
    updateDraft(value) {
      if (mode !== 'editing' || !nameEditable()) return false;
      draftName = String(value);
      dirty = evaluateDirty();
      error = null;
      return true;
    },
    updateField(field, value) {
      if (mode !== 'editing') return false;
      if (field === 'name') return controller.updateDraft(value);
      if (field === 'dataType') draftDataType = value === '' ? null : String(value);
      else if (field === 'description') draftDescription = value === '' ? null : String(value);
      else if (field === 'link') draftLink = value === '' ? null : String(value);
      else return false;
      dirty = evaluateDirty();
      error = null;
      return true;
    },
    beginSave() {
      if (mode !== 'editing' || saving) return false;
      saving = true;
      mode = 'saving';
      error = null;
      return true;
    },
    saveFailed(message) {
      saving = false;
      mode = 'editing';
      error = String(message || 'Save failed.');
      dirty = evaluateDirty();
    },
    saveSucceeded() {
      saving = false;
      dirty = false;
      mode = 'closed';
      status = action === 'rename' ? 'Renamed.' : action === 'edit-details' ? 'Details saved.' : 'Added.';
      pendingIntent = null;
    },
    requestSelection(intent) {
      if (saving || mode === 'saving') return { blocked: true, reason: 'saving' };
      if (!dirty) return { blocked: false, execute: true, intent };
      if (mode === 'confirm-replace') return { blocked: true, reason: 'prompt-open' };
      mode = 'confirm-replace';
      pendingIntent = intent;
      return { blocked: true, reason: 'dirty', intent };
    },
    continueEditing() {
      if (mode !== 'confirm-replace') return false;
      pendingIntent = null;
      mode = 'editing';
      return true;
    },
    discardChanges() {
      if (mode !== 'confirm-replace' && mode !== 'editing' && mode !== 'saving') return null;
      const intent = pendingIntent;
      reset();
      return intent;
    },
    cancel() {
      if (saving) return false;
      reset();
      return true;
    },
    close() { reset(); },
    clearError() { error = null; }
  };
  return controller;
}




