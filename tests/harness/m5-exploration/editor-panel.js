/**
 * E1/E2 editor panel. Form controls are created once and never rebuilt by
 * ordinary status publication. Controller state owns the draft.
 */
import { classifyFile, MAX_ATTACHMENT_BYTES } from '../../../src/engine/hypertree/editor/attachment-classification.js';

const UNSAVED_MESSAGE = 'Changes remain in this map but have not been saved.';

export function createEditorPanel({
  document,
  summaryHost,
  editorHost,
  controller,
  onSave,
  onRetryApplied = async () => ({ ok: false, message: 'Persistence retry unavailable.' }),
  onSaveAs = null,
  onState = () => {},
  onFormShown = () => {},
  onDiscardIntent = () => {},
  canEdit = () => true,
  getIdentity = () => ({ datasetToken: null, baseRevision: null }),
  attachments = null
}) {
  if (!document || !summaryHost || !editorHost || !controller) throw new Error('editor panel hosts are required');
  const abort = new AbortController();
  let details = null;
  let editorTarget = null;
  let composing = false;
  let lastFocus = null;
  let selectedFile = null;
  let fileClassification = null;
  let fileLoading = false;
  let fileError = '';
  let fileToken = 0;
  let pendingReservation = null;
  let appliedPending = false;
  let retryInFlight = false;
  let formToken = 0;
  let disposed = false;
  const resolveAttachments = () => (typeof attachments === 'function' ? attachments() : attachments);

  summaryHost.replaceChildren();
  const empty = document.createElement('p');
  empty.textContent = 'No selection';
  const summary = document.createElement('div');
  summary.setAttribute('tabindex', '-1');
  summary.className = 'editor-summary';
  const rowValues = new Map();
  const rowElements = new Map();
  for (const label of ['Name', 'Description', 'Link', 'Attachment']) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    const key = document.createElement('span');
    key.textContent = label;
    const value = document.createElement('span');
    value.textContent = '';
    row.append(key, value);
    summary.appendChild(row);
    rowValues.set(label, value);
    rowElements.set(label, row);
  }
  summaryHost.append(empty, summary);

  editorHost.replaceChildren();
  const form = document.createElement('form');
  form.id = 'editor-form';
  form.hidden = true;
  form.noValidate = true;
  form.setAttribute('aria-busy', 'false');
  const legend = document.createElement('h3');
  legend.textContent = 'Rename node';
  const targetLine = document.createElement('p');
  targetLine.id = 'editor-target';
  targetLine.className = 'editor-target';

  function createField(id, labelText, element) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editor-field';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;
    element.id = id;
    element.setAttribute('aria-describedby', 'editor-error editor-status');
    wrapper.append(label, element);
    return { wrapper, label, element };
  }
  const nameField = createField('editor-name', 'Name', document.createElement('input'));
  nameField.element.name = 'name';
  nameField.element.type = 'text';
  nameField.element.autocomplete = 'off';
  const descriptionField = createField('editor-description', 'Description', document.createElement('textarea'));
  descriptionField.element.name = 'description';
  descriptionField.element.rows = 5;
  const linkField = createField('editor-link', 'Web link', document.createElement('input'));
  linkField.element.name = 'link';
  linkField.element.type = 'text';
  linkField.element.autocomplete = 'off';  const dataTypeField = createField('editor-data-type', 'Data type', document.createElement('select'));
  dataTypeField.element.name = 'dataType';
  for (const [value, text] of [['', 'Choose data type'], ['file', 'File'], ['web-link', 'Web link']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    dataTypeField.element.appendChild(option);
  }
  const fileField = createField('editor-file', 'File', document.createElement('input'));
  fileField.element.name = 'file';
  fileField.element.type = 'file';
  const dataTypeInfo = document.createElement('p');
  dataTypeInfo.className = 'editor-status';
  dataTypeInfo.hidden = true;
  const legacyEditNotice = document.createElement('p');
  legacyEditNotice.className = 'editor-notice';
  legacyEditNotice.hidden = true;
  legacyEditNotice.textContent = 'Legacy / unclassified data. Link editing is unavailable and data type is unchanged.';
  const editDataNotice = document.createElement('p');
  editDataNotice.className = 'editor-notice';
  editDataNotice.hidden = true;
  editDataNotice.textContent = 'Changing data type or replacing a file is not available yet.';
  const attachmentInfo = document.createElement('p');
  attachmentInfo.className = 'editor-status';
  attachmentInfo.textContent = '';

  const error = document.createElement('p');
  error.id = 'editor-error';
  error.className = 'editor-error';
  error.setAttribute('aria-live', 'polite');
  error.textContent = '';
  const status = document.createElement('p');
  status.id = 'editor-status';
  status.className = 'editor-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = '';
  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const saveAsAction = document.createElement('button');
  saveAsAction.type = 'button';
  saveAsAction.textContent = 'Save As';
  saveAsAction.hidden = true;
  saveAsAction.disabled = true;
  actions.append(save, saveAsAction, cancel);
  form.append(legend, targetLine, nameField.wrapper, dataTypeField.wrapper, dataTypeInfo, legacyEditNotice, editDataNotice, descriptionField.wrapper, linkField.wrapper, fileField.wrapper, attachmentInfo, error, status, actions);

  const prompt = document.createElement('div');
  prompt.id = 'editor-prompt';
  prompt.hidden = true;
  prompt.setAttribute('role', 'group');
  prompt.setAttribute('aria-label', 'Unsaved editor changes');
  const promptText = document.createElement('p');
  promptText.textContent = 'This form has unsaved changes. Continue editing or discard them?';
  const promptActions = document.createElement('div');
  promptActions.className = 'editor-actions';
  const keep = document.createElement('button');
  keep.type = 'button';
  keep.textContent = 'Continue editing';
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.textContent = 'Discard changes';
  promptActions.append(keep, discard);
  prompt.append(promptText, promptActions);
  editorHost.append(form, prompt);

  const fieldFor = (name) => name === 'description' ? descriptionField : name === 'link' ? linkField : name === 'file' ? fileField : name === 'dataType' ? dataTypeField : nameField;
  function renderSummary() {
    const selected = Boolean(details);
    empty.hidden = selected;
    summary.hidden = !selected;
    if (!selected) return;
    const values = {
      Name: details.name || '',
      Description: typeof details.description === 'string' ? details.description : '',
      Link: details.dataType === 'web-link' && typeof details.link === 'string' ? details.link : '',
      Attachment: details.attachment ? String(details.attachment.originalName || '') + ' · ' + String(details.attachment.sizeBytes ?? 0) + ' bytes · ' + String(details.attachment.classification?.badge || details.attachment.classification?.format || 'unclassified') : ''
    };
    for (const [label, value] of Object.entries(values)) {
      const row = rowElements.get(label);
      row.hidden = label !== 'Name' && value === '';
      rowValues.get(label).textContent = value;
    }
  }
  function fieldsForAction(action) {
    const dataType = action === 'add-data' ? controller.draftDataType : editorTarget?.dataType;
    return {
      name: action === 'rename' || action === 'add-folder' || action === 'edit-folder' || action === 'add-data' || action === 'edit-data',
      description: action === 'add-folder' || action === 'edit-folder' || action === 'add-data' || action === 'edit-data' || action === 'edit-details' || action === 'edit-description',
      dataType: action === 'add-data',
      file: action === 'add-data' && dataType === 'file',
      link: (action === 'add-data' && dataType === 'web-link') || (action === 'edit-data' && dataType === 'web-link') || (action === 'edit-details' && dataType !== 'file'),
      attachment: action === 'edit-data' && dataType === 'file'
    };
  }
  function updateSaveState() {
    const shown = fieldsForAction(controller.action);
    const needsFile = shown.file && (!selectedFile || fileLoading || !fileClassification || Boolean(fileError));
    save.disabled = controller.isSaving() || !canEdit() || needsFile;
    form.setAttribute('aria-busy', controller.isSaving() ? 'true' : 'false');
  }
  function syncFormControls(busy = false) {
    const locked = appliedPending || busy || controller.isSaving() || !canEdit();
    cancel.disabled = retryInFlight || (!appliedPending && (busy || controller.isSaving()));
    saveAsAction.hidden = !appliedPending;
    saveAsAction.disabled = !appliedPending || retryInFlight || busy || controller.isSaving();
    nameField.element.readOnly = locked; descriptionField.element.readOnly = locked; linkField.element.readOnly = locked;
    fileField.element.readOnly = true;
    if (dataTypeField.element) dataTypeField.element.disabled = locked;
    if (fileField.element) fileField.element.disabled = locked;
    updateSaveState();
  }
  function setFormBusy(busy) { syncFormControls(busy); }
  function updateAttachmentInfo(shown) {
    const targetAttachment = editorTarget?.attachment;
    const parts = [];
    if (shown.attachment && targetAttachment) {
      parts.push(targetAttachment.originalName || '');
      parts.push(String(targetAttachment.sizeBytes ?? 0) + ' bytes');
      const classification = targetAttachment.classification;
      parts.push(classification ? String(classification.badge || classification.format) + (classification.needsReview ? ' (needs review)' : '') : 'unclassified');
    } else if (shown.file) {
      if (fileError) parts.push('File error: ' + fileError);
      else if (selectedFile) { parts.push(selectedFile.name); parts.push(String(selectedFile.size) + ' bytes'); if (fileLoading) parts.push('Classifying…'); else if (fileClassification) parts.push(String(fileClassification.badge || fileClassification.format) + (fileClassification.needsReview ? ' (needs review)' : '')); }
      else parts.push('Choose a file.');
    }
    attachmentInfo.hidden = !(shown.file || shown.attachment);
    attachmentInfo.textContent = parts.join(' · ');
  }
  function showForm() {
    const action = controller.action;
    const shown = fieldsForAction(action);
    form.hidden = false;
    prompt.hidden = true;
    nameField.wrapper.hidden = !shown.name;
    descriptionField.wrapper.hidden = !shown.description;
    dataTypeField.wrapper.hidden = !shown.dataType;
    linkField.wrapper.hidden = !shown.link;
    fileField.wrapper.hidden = !shown.file;
    nameField.element.value = controller.draftName;
    descriptionField.element.value = controller.draftDescription ?? '';
    linkField.element.value = controller.draftLink ?? '';
    dataTypeField.element.value = controller.draftDataType ?? '';
    legend.textContent = action === 'edit-folder' ? 'Edit Folder' : action === 'add-folder' ? 'Add Folder' : action === 'edit-data' ? 'Edit Data' : action === 'add-data' ? 'Add Data' : action === 'edit-description' ? 'Edit Description' : action === 'rename' ? 'Rename node' : 'Edit details';
    const prefix = action === 'add-folder' || action === 'add-data' ? 'Destination folder' : 'Target';
    targetLine.textContent = `${prefix}: ${editorTarget?.name || controller.targetId}`;
    const typeValue = action === 'edit-data' ? (editorTarget?.dataType === 'file' ? 'File' : editorTarget?.dataType === 'web-link' ? 'Web link' : 'Legacy / unclassified') : '';
    dataTypeInfo.hidden = action !== 'edit-data';
    legacyEditNotice.hidden = !(action === 'edit-data' && editorTarget?.dataType !== 'file' && editorTarget?.dataType !== 'web-link');
    dataTypeInfo.textContent = typeValue ? 'Type: ' + typeValue : '';
    editDataNotice.hidden = action !== 'edit-data';
    for (const field of [nameField, descriptionField, linkField]) field.element.setAttribute('aria-invalid', 'false');
    error.textContent = controller.error || '';
    status.textContent = controller.status || '';
    if (shown.dataType && !controller.draftDataType) controller.updateField('dataType', '');
    updateAttachmentInfo(shown);
    setFormBusy(false);
    lastFocus = document.activeElement || null;
    const focusField = shown.name ? nameField.element : descriptionField.element;
    onFormShown({ reason: 'opened' });
    focusField.focus();
    if (shown.name && typeof focusField.select === 'function') focusField.select();
  }
  function hideAll() {
    form.hidden = true;
    prompt.hidden = true;
    setFormBusy(false);
  }
  function setError(message, field = null) {
    controller.saveFailed(message);
    error.textContent = String(message || 'Save failed.');
    const target = fieldFor(field || 'name');
    target.element.setAttribute('aria-invalid', 'true');
    setFormBusy(!canEdit());
    target.element.focus();
  }
  function renderAppliedUnsavedFeedback() {
    appliedPending = true;
    error.textContent = '';
    status.textContent = UNSAVED_MESSAGE;
    save.textContent = 'Retry Save';
    save.disabled = false;
    saveAsAction.hidden = false;
    saveAsAction.disabled = false;
    cancel.textContent = 'Close';
    cancel.disabled = false;
    syncFormControls();
  }

  async function retryAppliedPersistence() {
    if (retryInFlight || disposed) return;
    const ownerFormToken = formToken;
    const ownerController = controller;
    retryInFlight = true;
    status.textContent = 'Saving…';
    save.disabled = true;
    cancel.disabled = true;
    let result;
    try { result = await onRetryApplied(); } catch (errorValue) { result = { ok: false, message: String(errorValue?.message || errorValue) }; }
    if (disposed || formToken !== ownerFormToken || controller !== ownerController || !appliedPending) { retryInFlight = false; return; }
    if (result?.ok === true) { appliedPending = false; retryInFlight = false; save.textContent = 'Save'; cancel.textContent = 'Cancel'; controller.saveSucceeded(); status.textContent = 'Saved in this browser.'; pendingReservation = null; resetAttachment({ keepReservation: true }); hideAll(); renderSummary(); summary.focus(); try { onState?.({ reason: 'editor-saved' }); } catch {} return; }
    retryInFlight = false;
    renderAppliedUnsavedFeedback();
  }
  async function submit() {
    if (appliedPending) return retryAppliedPersistence();
    if (composing || controller.isSaving() || !controller.isOpen()) return;
    const action = controller.action;
    const shown = fieldsForAction(action);
    if (shown.name) controller.updateField('name', nameField.element.value);
    if (shown.description) controller.updateField('description', descriptionField.element.value);
    if (shown.dataType) controller.updateField('dataType', dataTypeField.element.value);
    if (shown.link) controller.updateField('link', linkField.element.value);
    if (shown.file && (!selectedFile || fileLoading || !fileClassification || fileError)) {
      setError(fileError || 'Choose and classify a file before saving.', 'file');
      return;
    }
    if (!controller.beginSave()) return;
    const ownerFormToken = formToken;
    const ownerController = controller;
    setFormBusy(true);
    error.textContent = '';
    for (const field of [nameField, descriptionField, linkField]) field.element.setAttribute('aria-invalid', 'false');
    status.textContent = 'Saving…';
    let result;
    try {
      const payload = {
        action,
        targetId: controller.targetId,
        name: controller.draftName,
        description: controller.draftDescription,
        dataType: controller.draftDataType,
        link: shown.link ? controller.draftLink : null,
        linkProvided: shown.link,
        file: shown.file ? selectedFile : null,
        classification: shown.file ? fileClassification : null,
        originalName: shown.file ? selectedFile?.name ?? null : null,
        sizeBytes: shown.file ? selectedFile?.size ?? null : null,
        mime: shown.file ? selectedFile?.type ?? '' : null,
        attachmentId: shown.file ? pendingReservation?.id ?? null : null,
        datasetToken: controller.datasetToken,
        baseRevision: controller.baseRevision,
        formToken,
      };
      const pending = onSave(payload);
      result = pending && typeof pending.then === 'function' ? await pending : pending;
    } catch (errorValue) {
      result = { ok: false, message: String(errorValue?.message || errorValue) };
    }
    if (disposed || formToken !== ownerFormToken || controller !== ownerController || !controller.isSaving()) return;
    if (!result || result.ok !== true) {
      if (result?.applied === true) {
        appliedPending = true;
        pendingReservation = null;
        controller.saveFailed(UNSAVED_MESSAGE);
        renderAppliedUnsavedFeedback();
        try { onState?.({ reason: 'editor-applied-unsaved' }); } catch {}
        return;
      }
      setError(result?.message || 'Save failed.', result?.field || null);
      status.textContent = 'Save failed. Retry when ready.';
      onState({ reason: 'editor-save-failed' });
      return;
    }
    controller.saveSucceeded();
    save.textContent = 'Save';
    cancel.textContent = 'Cancel';
    status.textContent = result.reason === 'noop' ? 'No changes.' : controller.status || 'Saved.';
    pendingReservation = null;
    resetAttachment({ keepReservation: true });
    hideAll();
    renderSummary();
    summary.focus();
    try { onState?.({ reason: 'editor-saved' }); } catch {}
    onState({ reason: 'editor-saved' });
  }
  function resetAttachment({ keepReservation = false } = {}) {
    if (!keepReservation && pendingReservation) pendingReservation.owner.release(pendingReservation.id);
    pendingReservation = null;
    fileToken += 1;
    selectedFile = null;
    fileClassification = null;
    fileLoading = false;
    fileError = '';
    if (fileField.element.value !== undefined) fileField.element.value = '';
    updateAttachmentInfo(fieldsForAction(controller.action));
    updateSaveState();
  }
  async function selectAttachment(file) {
    fileToken += 1;
    const token = fileToken;
    if (pendingReservation) pendingReservation.owner.release(pendingReservation.id);
    pendingReservation = null;
    selectedFile = file || null;
    fileClassification = null;
    fileError = '';
    fileLoading = Boolean(file);
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      fileError = `File is larger than ${MAX_ATTACHMENT_BYTES} bytes.`;
      fileLoading = false;
      selectedFile = null;
    }
    const attachmentOwner = resolveAttachments();
    if (file && !fileError && attachmentOwner) {
      const reserved = attachmentOwner.reserve(file);
      if (!reserved.ok) {
        fileError = reserved.message || 'The file cannot be retained.';
        selectedFile = null;
        fileLoading = false;
        if (fileField.element.value !== undefined) fileField.element.value = '';
      } else pendingReservation = { id: reserved.id, owner: attachmentOwner };
    }
    updateAttachmentInfo(fieldsForAction(controller.action));
    updateSaveState();
    if (!file || fileError) return;
    try {
      const classification = await classifyFile(file);
      if (token !== fileToken) return;
      if (pendingReservation) pendingReservation.owner.setClassification(pendingReservation.id, classification);
      fileClassification = classification;
    } catch {
      if (token !== fileToken) return;
      if (pendingReservation) pendingReservation.owner.release(pendingReservation.id);
      pendingReservation = null;
      selectedFile = null;
      if (fileField.element.value !== undefined) fileField.element.value = '';
      fileError = 'The selected file could not be read.';
    } finally {
      if (token === fileToken) {
        fileLoading = false;
        updateAttachmentInfo(fieldsForAction(controller.action));
        updateSaveState();
      }
    }
  }
  function requestCancel() {
    if (composing || controller.isSaving() || retryInFlight) return false;
    cancelEdit();
    return true;
  }
  function cancelEdit() {
    if (composing || controller.isSaving() || retryInFlight) return;
    appliedPending = false;
    fileToken += 1;
    resetAttachment();
    controller.cancel();
    hideAll();
    status.textContent = '';
    renderSummary();
    summary.focus();
    try { onState?.({ reason: 'editor-cancelled' }); } catch {}
    onState({ reason: 'editor-cancelled' });
  }
  function openAction(target, action) {
    if (!target || !canEdit() || controller.isSaving()) return { ok: false, reason: 'unavailable' };
    if (controller.isOpen()) {
      if (controller.targetId === target.id && controller.action === action) {
        if (controller.mode === 'confirm-replace') { onFormShown({ reason: 'existing' }); keep.focus(); }
        else {
          onFormShown({ reason: 'existing' });
          const shown = fieldsForAction(action);
          (shown.name ? nameField.element : descriptionField.element).focus();
        }
        return { ok: true, sameTarget: true };
      }
      if (controller.dirty || controller.mode === 'confirm-replace') {
        return { ok: false, blocked: true, reason: 'dirty' };
      }
      fileToken += 1;
      resetAttachment();
      controller.cancel();
      hideAll();
    }
    const identity = getIdentity() || {};
    if (!controller.open({
      id: target.id,
      action,
      name: action === 'add-folder' || action === 'add-data' ? '' : (target.name || ''),
      description: action === 'edit-folder' || action === 'edit-data' || action === 'edit-details' ? target.description ?? null : null,
      link: action === 'edit-data' || action === 'edit-details' ? target.link ?? null : null,
      dataType: action === 'add-data' ? '' : (action === 'edit-data' && (target.dataType === 'file' || target.dataType === 'web-link') ? target.dataType : null),
      datasetToken: identity.datasetToken ?? null,
      baseRevision: identity.baseRevision ?? null
    })) return { ok: false, reason: 'open-failed' };
    editorTarget = target;
    formToken += 1;
    showForm();
    renderSummary();
    return { ok: true };
  }
  function openEditor(target) { return openAction(target, 'rename'); }
  function openEditFolder(target) { return openAction(target, 'edit-folder'); }
  function openEditData(target) { return openAction(target, 'edit-data'); }
  function openAdd(target, kind) { return openAction(target, kind === 'folder' ? 'add-folder' : 'add-data'); }
  function openDetails(target) { return openAction(target, 'edit-details'); }
  function requestSelection(intent) {
    const decision = controller.requestSelection(intent);
    if (decision.blocked && decision.reason === 'dirty') {
      prompt.hidden = false;
      lastFocus = document.activeElement || null;
      keep.focus();
    }
    return decision;
  }
  function continueEditing() {
    controller.continueEditing();
    prompt.hidden = true;
    const shown = fieldsForAction(controller.action);
    onFormShown({ reason: 'continued' });
    (shown.name ? nameField.element : descriptionField.element).focus();
    try { onState?.({ reason: 'editor-continued' }); } catch {}
    onState({ reason: 'editor-continued' });
  }
  function discardChanges() {
    const intent = controller.discardChanges();
    hideAll();
    renderSummary();
    summary.focus();
    onDiscardIntent(intent);
    try { onState?.({ reason: 'editor-discarded' }); } catch {}
    onState({ reason: 'editor-discarded' });
  }

  const opts = { signal: abort.signal };
  for (const field of [nameField, descriptionField, linkField]) {
    field.element.addEventListener('input', () => controller.updateField(field === nameField ? 'name' : field === descriptionField ? 'description' : 'link', field.element.value), opts);
    field.element.addEventListener('compositionstart', () => {
      composing = true;
      form.setAttribute('data-composing', 'true');
    }, opts);
    field.element.addEventListener('compositionend', () => {
      composing = false;
      form.removeAttribute('data-composing');
      controller.updateField(field === nameField ? 'name' : field === descriptionField ? 'description' : 'link', field.element.value);
    }, opts);
    field.element.addEventListener('keydown', (event) => {
      if (event.isComposing || composing) return;
      if (event.key === 'Escape') { event.preventDefault(); requestCancel(); return; }
      if (event.key !== 'Enter') return;
      if (field === descriptionField) {
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); submit(); }
        return;
      }
      event.preventDefault();
      submit();
    }, opts);
  }
  dataTypeField.element.addEventListener('change', () => {
    controller.updateField('dataType', dataTypeField.element.value);
    if (dataTypeField.element.value !== 'file') resetAttachment();
    const shown = fieldsForAction(controller.action);
    fileField.wrapper.hidden = !shown.file;
    linkField.wrapper.hidden = !shown.link;
    updateAttachmentInfo(shown);
    updateSaveState();
  }, opts);
  fileField.element.addEventListener('change', () => {
    const file = fileField.element.files && fileField.element.files[0];
    selectAttachment(file || null);
  }, opts);

  form.addEventListener('submit', (event) => { event.preventDefault(); submit(); }, opts);
  cancel.addEventListener('click', requestCancel, opts);
  saveAsAction.addEventListener('click', async () => {
    if (!appliedPending || retryInFlight || typeof onSaveAs !== 'function') return;
    retryInFlight = true;
    syncFormControls();
    try { await onSaveAs(); } finally { retryInFlight = false; syncFormControls(); }
  }, opts);
  keep.addEventListener('click', continueEditing, opts);
  discard.addEventListener('click', discardChanges, opts);

  const panel = {
    get form() { return form; },
    get saveButton() { return save; },
    get summary() { return summary; },
    get input() { return nameField.element; },
    get descriptionInput() { return descriptionField.element; },
    get linkInput() { return linkField.element; },
    get dataTypeInput() { return dataTypeField.element; },
    get fileInput() { return fileField.element; },
    getAttachmentText() { return attachmentInfo.textContent; },
    get prompt() { return prompt; },
    setDetails(value) {
      details = value || null;
      if (!form.hidden) setFormBusy(controller.isSaving() || !canEdit());
      renderSummary();
    },
    requestSelection,
    submit,
    getFormToken() { return formToken; },
    getRetryState() { return { appliedPending, retryInFlight, disposed }; },
    completeAppliedFromPersistence() {
      if (!appliedPending) return false;
      appliedPending = false; retryInFlight = false; save.textContent = 'Save'; cancel.textContent = 'Cancel'; saveAsAction.hidden = true; saveAsAction.disabled = true;
      pendingReservation = null; controller.saveSucceeded(); status.textContent = 'Saved in this browser.';
      resetAttachment({ keepReservation: true }); hideAll(); renderSummary(); summary.focus();
      try { onState?.({ reason: 'editor-saved' }); } catch {}
      return true;
    },
    showSaveError(message) { if (appliedPending) { error.textContent = ''; renderAppliedUnsavedFeedback(); } else setError(message); },
    clear() {
      if (retryInFlight) return false;
      details = null;
      fileToken += 1;
      resetAttachment();
      hideAll();
      error.textContent = '';
      status.textContent = '';
      controller.close();
      renderSummary();
    },
    openEditor,
    openAdd,
    openEditFolder,
    openEditData,
    openDetails,
    openAction,
    getDetails() { return details; },
    getEditorTarget() { return editorTarget; },
    getTargetLabel() { return targetLine.textContent; },
    getSummaryValue(label) { return rowValues.get(label)?.textContent || null; },
    getFieldValue(field) { return fieldFor(field).element.value; },
    isFieldVisible(field) { return !fieldFor(field).wrapper.hidden; },
    isComposing() { return composing; },
    destroy() {
      disposed = true; formToken += 1; appliedPending = false;
      abort.abort();
      fileToken += 1;
      resetAttachment();
      controller.close();
      summaryHost.replaceChildren();
      editorHost.replaceChildren();
    }
  };
  renderSummary();
  return panel;
}






































