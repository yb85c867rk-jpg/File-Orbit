import { isFocusableElement } from './shell-controls.js';
import { validateName, validateDescription } from '../../../src/engine/hypertree/editor/validation.js';

export function createCreateMapDialog({
  document, host, onNameChange = null, onCreate, onCancel,
  getFallbackFocus = () => null, hasCurrentMap = () => true,
  getLibraries = () => [], getDefaultLibraryId = () => null,
  onLinkLibrary = null, onRefreshLibraries = null
} = {}) {
  if (!document || !host) throw new Error('create-map dialog requires document and host');
  const backdrop = document.createElement('div');
  backdrop.className = 'create-map-backdrop';
  backdrop.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'create-map-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'create-map-title');

  const title = document.createElement('h2'); title.id = 'create-map-title'; title.textContent = 'Create Map';
  const note = document.createElement('p'); note.className = 'create-map-note';
  note.textContent = 'Create an empty map with one root folder. Add map information, then choose a linked Map Library destination.';

  const form = document.createElement('div'); form.className = 'create-map-form';
  const infoHeading = document.createElement('h3'); infoHeading.textContent = 'Map Information';
  const nameLabel = document.createElement('label'); nameLabel.textContent = 'Map title';
  const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.maxLength = 200; nameInput.autocomplete = 'off';
  const nameError = document.createElement('p'); nameError.className = 'create-map-name-error'; nameError.setAttribute('role', 'alert');
  nameLabel.appendChild(nameInput);
  const descriptionLabel = document.createElement('label'); descriptionLabel.textContent = 'Map description (optional)';
  const descriptionInput = document.createElement('textarea'); descriptionInput.rows = 4; descriptionInput.maxLength = 2000; descriptionInput.className = 'create-map-description';
  const descriptionError = document.createElement('p'); descriptionError.className = 'create-map-name-error'; descriptionError.setAttribute('role', 'alert');
  descriptionLabel.appendChild(descriptionInput);

  const libraryHeading = document.createElement('h3'); libraryHeading.textContent = 'Map Library Setting';
  const libraryGuidance = document.createElement('p'); libraryGuidance.className = 'create-map-location-guidance';
  libraryGuidance.textContent = 'Linked Map Libraries are shown below. Choose the destination for this new map. Linking a folder only updates the shared Library collection; it does not create a map.';
  const destinationLabel = document.createElement('p'); destinationLabel.className = 'create-map-location-label'; destinationLabel.textContent = 'Creation destination';
  const destinationName = document.createElement('p'); destinationName.className = 'create-map-location-name'; destinationName.textContent = 'No Map Library selected';
  const libraryList = document.createElement('div'); libraryList.className = 'create-map-library-list';
  const libraryRow = document.createElement('div'); libraryRow.className = 'create-map-location';
  const linkButton = document.createElement('button'); linkButton.type = 'button'; linkButton.textContent = 'Link Folder to Map Library';
  const refreshButton = document.createElement('button'); refreshButton.type = 'button'; refreshButton.textContent = 'Refresh';
  libraryRow.append(linkButton, refreshButton);

  const status = document.createElement('p'); status.className = 'create-map-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'create-map-actions';
  const cancelButton = document.createElement('button'); cancelButton.type = 'button'; cancelButton.textContent = 'Cancel';
  const createButton = document.createElement('button'); createButton.type = 'button'; createButton.textContent = 'Create Map'; createButton.disabled = true;
  actions.append(cancelButton, createButton);

  const confirm = document.createElement('div'); confirm.className = 'create-map-confirm'; confirm.hidden = true;
  const confirmText = document.createElement('p'); confirmText.textContent = 'Replace the current map and clear its session history?';
  const confirmActions = document.createElement('div'); confirmActions.className = 'create-map-actions';
  const confirmCancelButton = document.createElement('button'); confirmCancelButton.type = 'button'; confirmCancelButton.textContent = 'Cancel';
  const backButton = document.createElement('button'); backButton.type = 'button'; backButton.textContent = 'Back';
  const replaceButton = document.createElement('button'); replaceButton.type = 'button'; replaceButton.textContent = 'Replace map';
  confirmActions.append(confirmCancelButton, backButton, replaceButton);
  confirm.append(confirmText, confirmActions);

  form.append(infoHeading, nameLabel, nameError, descriptionLabel, descriptionError,
    libraryHeading, libraryGuidance, destinationLabel, destinationName, libraryList, libraryRow);
  dialog.append(title, note, form, status, actions, confirm);
  backdrop.appendChild(dialog); host.appendChild(backdrop);

  let open = false;
  let submitting = false;
  let preparing = false;
  let composing = false;
  let previewData = null;
  let destination = null;
  let lastFocus = null;
  let sessionSeq = 0;
  let prepareSeq = 0;
  let activePrepare = null;
  let libraryBusy = false;

  const setStatus = (message, kind = 'info') => { status.textContent = message || ''; status.dataset.kind = kind; };
  const libraries = () => {
    try { const list = getLibraries?.(); return Array.isArray(list) ? list : []; } catch { return []; }
  };
  const ownsPrepare = (token) => Boolean(token && token === activePrepare && token.session === sessionSeq && open);
  const setDestination = (record) => {
    destination = record ? { id: record.id, name: record.name, handle: record.handle } : null;
    destinationName.textContent = destination ? destination.name : 'No Map Library selected';
    destinationName.title = destination?.name || '';
    syncButtonState();
  };
  const destinationRecord = () => destination ? libraries().find((record) => record.id === destination.id) : null;
  function renderLibraries() {
    libraryList.replaceChildren();
    const records = libraries();
    for (const record of records) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'create-map-library-option';
      button.setAttribute('aria-pressed', String(destination?.id === record.id));
      button.textContent = record.name;
      button.title = record.name;
      button.addEventListener('click', () => {
        if (!open || submitting || libraryBusy) return;
        setDestination(record);
        setStatus('Creation destination: ' + record.name + '. The sidebar selection and open map were not changed.', 'ok');
      });
      libraryList.appendChild(button);
    }
    if (!records.length) {
      const empty = document.createElement('p'); empty.className = 'create-map-status';
      empty.textContent = 'No Map Libraries linked yet. Link a folder to choose a destination.';
      libraryList.appendChild(empty);
    }
    const current = destinationRecord();
    if (destination && !current) {
      setDestination(null);
      setStatus('The selected destination is no longer linked. Choose another Map Library.', 'error');
    } else if (destination && current && current.handle !== destination.handle) {
      setDestination(null);
      setStatus('The linked folder changed. Select the Library destination again.', 'error');
    } else if (current) {
      destination.name = current.name;
      destinationName.textContent = current.name;
      destinationName.title = current.name;
    }
    syncButtonState();
  }
  function syncButtonState() {
    const busy = submitting || preparing || composing || libraryBusy;
    const confirmation = open && !confirm.hidden;
    cancelButton.disabled = !open || submitting || libraryBusy;
    confirmCancelButton.disabled = !open || submitting || libraryBusy;
    nameInput.disabled = !open || submitting;
    descriptionInput.disabled = !open || submitting;
    linkButton.disabled = !open || busy;
    refreshButton.disabled = !open || busy;
    createButton.disabled = !open || !previewData || !destination || busy || confirmation;
    backButton.disabled = !confirmation || !previewData || submitting;
    replaceButton.disabled = !confirmation || !previewData || submitting;
    for (const button of libraryList.children || []) if (button.tagName === 'BUTTON') button.disabled = !open || busy;
  }
  function beginPrepare() {
    prepareSeq += 1;
    const token = { seq: prepareSeq, session: sessionSeq, pending: true };
    activePrepare = token; preparing = true; syncButtonState(); return token;
  }
  function endPrepare(token) {
    if (!token || token !== activePrepare) return;
    token.pending = false; activePrepare = null; preparing = false; syncButtonState();
  }
  function abandonPreparation() { activePrepare = null; preparing = false; syncButtonState(); }
  const clearPreview = () => { previewData = null; syncButtonState(); };
  function acceptCandidate(result) {
    if (!result?.ok) { clearPreview(); setStatus(result?.message || 'The map could not be prepared.', 'error'); return; }
    previewData = result;
    setStatus('Ready to create “' + result.tree.name + '” in ' + (destination?.name || 'the selected Map Library') + '.', 'ok');
    syncButtonState();
  }
  async function updateName() {
    const token = beginPrepare();
    try {
      const checked = validateName(nameInput.value);
      nameError.textContent = checked.ok ? '' : checked.message;
      clearPreview();
      if (!ownsPrepare(token)) return;
      if (!checked.ok) { setStatus(checked.message, 'error'); return; }
      const desc = validateDescription(descriptionInput.value);
      descriptionError.textContent = desc.ok ? '' : desc.message;
      if (!desc.ok) { setStatus(desc.message, 'error'); return; }
      if (typeof onNameChange !== 'function') { setStatus('Enter a map title.'); return; }
      setStatus('Preparing map…');
      try {
        const result = await onNameChange({ mapName: checked.name, description: desc.value, selection: { files: [], folders: [] } });
        if (!ownsPrepare(token)) return;
        acceptCandidate(result);
      } catch (error) {
        if (ownsPrepare(token)) { clearPreview(); setStatus(String(error?.message || error), 'error'); }
      }
    } finally { endPrepare(token); }
  }
  nameInput.addEventListener('input', (event) => { if (!composing && !event.isComposing) updateName(); });
  descriptionInput.addEventListener('input', () => {
    const checked = validateDescription(descriptionInput.value);
    descriptionError.textContent = checked.ok ? '' : checked.message;
    if (checked.ok) updateName(); else clearPreview();
  });
  nameInput.addEventListener('compositionstart', () => { composing = true; syncButtonState(); });
  nameInput.addEventListener('compositionend', () => { composing = false; syncButtonState(); updateName(); });

  linkButton.addEventListener('click', async () => {
    if (!open || submitting || libraryBusy || typeof onLinkLibrary !== 'function') return;
    libraryBusy = true; syncButtonState(); setStatus('Choose a folder to link…');
    try {
      const result = await onLinkLibrary();
      if (!open) return;
      if (result?.ok && result.library) {
        renderLibraries();
        setDestination(result.library);
        setStatus('Linked ' + result.library.name + ' as the creation destination.', 'ok');
      } else if (result?.reason !== 'cancelled' && result?.reason !== 'stale') {
        setStatus(String(result?.message || 'The folder could not be linked.'), 'error');
      } else if (result?.reason === 'cancelled') {
        setStatus('Folder linking cancelled. Your map details and destination were kept.');
      }
    } catch (error) {
      if (open) setStatus(String(error?.message || error), 'error');
    } finally {
      if (open) { libraryBusy = false; renderLibraries(); syncButtonState(); }
    }
  });
  refreshButton.addEventListener('click', async () => {
    if (!open || submitting || libraryBusy || typeof onRefreshLibraries !== 'function') return;
    libraryBusy = true; syncButtonState(); setStatus('Refreshing Map Libraries…');
    try {
      const result = await onRefreshLibraries();
      if (!open) return;
      renderLibraries();
      setStatus(result?.message || 'Map Library list refreshed. The current destination is kept when it is still available.', 'ok');
    } catch (error) {
      if (open) setStatus(String(error?.message || error), 'error');
    } finally {
      if (open) { libraryBusy = false; renderLibraries(); syncButtonState(); }
    }
  });

  const isVisible = (el) => isFocusableElement(el, document);
  const focusables = () => {
    const list = confirm.hidden
      ? [nameInput, descriptionInput, ...(libraryList.children || []), linkButton, refreshButton, cancelButton, createButton]
      : [confirmCancelButton, backButton, replaceButton];
    return list.filter((el) => el?.tagName === 'BUTTON' || el === nameInput || el === descriptionInput).filter(isVisible);
  };
  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); if (!submitting && !libraryBusy) close(); return; }
    if (event.key !== 'Tab') return;
    const list = focusables(); if (!list.length) return;
    const first = list[0]; const last = list.at(-1);
    if (!list.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);

  async function submitCreation() {
    if (!open || !previewData || !destination || submitting) return;
    const session = sessionSeq;
    const candidate = { ...previewData, destinationId: destination.id, destinationHandle: destination.handle, destinationName: destination.name };
    submitting = true; setStatus('Creating map…'); syncButtonState(); confirmCancelButton.focus();
    try {
      const outcome = await onCreate(candidate, { ...destination });
      if (!open || session !== sessionSeq) return;
      if (outcome?.stale) return;
      if (outcome?.ok === false) {
        setStatus(String(outcome.message || 'The map could not be created.'), 'error');
        if (outcome.keepDraft) {
          previewData = candidate.candidate || previewData;
          confirm.hidden = true; form.hidden = false; actions.hidden = false;
        } else if (outcome.reason === 'zero-viewport') { confirm.hidden = true; form.hidden = false; actions.hidden = false; }
        else previewData = null;
        syncButtonState();
      } else {
        previewData = null;
        submitting = false;
        close({ restoreFocus: true });
      }
    } catch (error) {
      if (open && session === sessionSeq) setStatus(String(error?.message || error), 'error');
    } finally {
      if (session === sessionSeq) { submitting = false; syncButtonState(); }
    }
  }
  createButton.addEventListener('click', () => {
    if (!open || !previewData || !destination || submitting || !confirm.hidden) return;
    if (!hasCurrentMap()) { submitCreation(); return; }
    confirm.hidden = false; form.hidden = true; actions.hidden = true; syncButtonState(); replaceButton.focus();
  });
  replaceButton.addEventListener('click', () => { if (open && previewData && !submitting) submitCreation(); });
  cancelButton.addEventListener('click', () => { if (!submitting && !libraryBusy) close(); });
  confirmCancelButton.addEventListener('click', () => { if (!submitting && !libraryBusy) close(); });
  backButton.addEventListener('click', () => {
    if (!open || submitting || confirm.hidden) return;
    confirm.hidden = true; form.hidden = false; actions.hidden = false; syncButtonState(); createButton.focus();
  });

  function close({ restoreFocus = true } = {}) {
    if (!open || submitting) return;
    open = false; sessionSeq += 1; submitting = false; libraryBusy = false; abandonPreparation(); composing = false;
    backdrop.hidden = true; clearPreview(); setDestination(null); nameInput.value = ''; descriptionInput.value = '';
    nameError.textContent = ''; descriptionError.textContent = ''; confirm.hidden = true; form.hidden = false; actions.hidden = false;
    setStatus(''); syncButtonState();
    onCancel?.();
    if (restoreFocus) {
      const candidate = isVisible(lastFocus) ? lastFocus : getFallbackFocus?.();
      const target = isVisible(candidate) ? candidate : getFallbackFocus?.();
      if (isVisible(target)) target.focus();
    }
  }
  function show() {
    if (open) return;
    open = true; sessionSeq += 1; submitting = false; preparing = false; composing = false; libraryBusy = false;
    activePrepare = null; previewData = null; nameInput.value = ''; descriptionInput.value = '';
    nameError.textContent = ''; descriptionError.textContent = ''; confirm.hidden = true; form.hidden = false; actions.hidden = false;
    destination = null;
    renderLibraries();
    const preferredId = getDefaultLibraryId?.();
    const preferred = preferredId ? libraries().find((record) => record.id === preferredId) : null;
    if (preferred) setDestination(preferred); else setDestination(null);
    syncButtonState();
    setStatus('Enter a map title and choose a linked Map Library destination.');
    backdrop.hidden = false; lastFocus = document.activeElement || null; nameInput.focus();
  }

  return {
    element: backdrop, show, close, get open() { return open; },
    refreshSaveLocation() { if (open) renderLibraries(); },
    refreshLibraries() { if (open) renderLibraries(); },
    setDropEntryHandler() {},
    destroy() { if (open && !submitting) close({ restoreFocus: false }); document.removeEventListener('keydown', onKey); backdrop.remove(); }
  };
}


