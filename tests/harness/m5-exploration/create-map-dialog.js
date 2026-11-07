import { isFocusableElement } from './shell-controls.js';
import { CREATE_MAP_DESCRIPTION_CODE_POINTS, validateName, validateDescription } from '../../../src/engine/hypertree/editor/validation.js';

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

  const form = document.createElement('div'); form.className = 'create-map-form';
  const infoHeading = document.createElement('h3'); infoHeading.textContent = 'Map Information';
  const nameLabel = document.createElement('label'); nameLabel.textContent = 'Map title';
  const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.maxLength = 200; nameInput.autocomplete = 'off';
  const nameError = document.createElement('p'); nameError.className = 'create-map-name-error'; nameError.setAttribute('role', 'alert');
  nameLabel.appendChild(nameInput);
  const descriptionLabel = document.createElement('label'); descriptionLabel.textContent = 'Map description (optional)';
  const descriptionInput = document.createElement('textarea'); descriptionInput.rows = 2; descriptionInput.className = 'create-map-description';
  const descriptionCounter = document.createElement('span'); descriptionCounter.className = 'create-map-description-count'; descriptionCounter.setAttribute('aria-live', 'polite');
  const descriptionRow = document.createElement('span'); descriptionRow.className = 'create-map-description-row';
  descriptionRow.append(descriptionInput, descriptionCounter);
  const descriptionError = document.createElement('p'); descriptionError.className = 'create-map-name-error'; descriptionError.setAttribute('role', 'alert');
  descriptionLabel.append(descriptionRow, descriptionError);

  const libraryHeading = document.createElement('h3'); libraryHeading.textContent = 'Map Library Setting';
  const libraryControls = document.createElement('div'); libraryControls.className = 'create-map-library-controls';
  const libraryToggle = document.createElement('button');
  libraryToggle.type = 'button'; libraryToggle.id = 'create-map-library-toggle'; libraryToggle.className = 'create-map-library-toggle';
  libraryToggle.textContent = 'Linked Map Libraries'; libraryToggle.setAttribute('aria-expanded', 'false'); libraryToggle.setAttribute('aria-controls', 'create-map-library-list');
  const newButton = document.createElement('button');
  newButton.type = 'button'; newButton.className = 'create-map-library-new'; newButton.textContent = '+ New'; newButton.setAttribute('aria-label', 'Link folder to Map Library'); newButton.title = 'Link folder to Map Library';
  libraryControls.append(libraryToggle, newButton);
  const destinationName = document.createElement('p'); destinationName.className = 'create-map-selected-destination'; destinationName.textContent = 'No Map Library selected';
  const libraryList = document.createElement('div'); libraryList.className = 'create-map-library-list'; libraryList.id = 'create-map-library-list'; libraryList.hidden = true;
  const libraryError = document.createElement('p'); libraryError.className = 'create-map-name-error'; libraryError.setAttribute('role', 'alert');

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

  form.append(infoHeading, nameLabel, nameError, descriptionLabel, libraryHeading, libraryControls, destinationName, libraryList, libraryError);
  dialog.append(title, form, status, actions, confirm);
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

  let descriptionComposing = false;
  let listExpanded = false;
  let refreshButton = null;

  const setStatus = (message, kind = 'info') => { status.textContent = message || ''; status.dataset.kind = kind; };
  const setLibraryError = (message = '') => { libraryError.textContent = message || ''; };
  const codePointCount = (value) => [...String(value || '')].length;
  const updateDescriptionCount = () => {
    descriptionCounter.textContent = `${codePointCount(descriptionInput.value)} / ${CREATE_MAP_DESCRIPTION_CODE_POINTS}`;
  };
  const checkDescription = (value) => {
    const count = codePointCount(value);
    if (count > CREATE_MAP_DESCRIPTION_CODE_POINTS) return { ok: false, message: `Description must be at most ${CREATE_MAP_DESCRIPTION_CODE_POINTS} characters.` };
    return validateDescription(value);
  };
  const libraries = () => {
    try { const list = getLibraries?.(); return Array.isArray(list) ? list : []; } catch { return []; }
  };
  const ownsPrepare = (token) => Boolean(token && token === activePrepare && token.session === sessionSeq && open);
  const updateOptionStates = () => {
    for (const button of libraryList.children || []) {
      if (button.tagName !== 'BUTTON' || !button.dataset.libraryId) continue;
      const selected = button.dataset.libraryId === destination?.id;
      button.setAttribute('aria-pressed', String(selected));
      button.classList?.toggle?.('create-map-library-option-selected', selected);
    }
  };
  const setDestination = (record) => {
    destination = record ? { id: record.id, name: record.name, handle: record.handle } : null;
    destinationName.textContent = destination ? destination.name : 'No Map Library selected';
    destinationName.title = destination?.name || '';
    updateOptionStates();
    syncButtonState();
  };
  const destinationRecord = () => destination ? libraries().find((record) => record.id === destination.id) : null;
  const setListExpanded = (expanded) => {
    listExpanded = Boolean(expanded);
    libraryList.hidden = !listExpanded;
    libraryToggle.setAttribute('aria-expanded', String(listExpanded));
    syncButtonState();
  };
  async function refreshLibraries() {
    if (!open || submitting || libraryBusy || typeof onRefreshLibraries !== 'function') return;
    libraryBusy = true; syncButtonState(); setStatus('Refreshing…'); setLibraryError('');
    try {
      const result = await onRefreshLibraries();
      if (!open) return;
      renderLibraries();
      setStatus('');
      if (result?.ok === false) setLibraryError(String(result?.message || 'The Map Library list could not be refreshed.'));
    } catch (error) {
      if (open) setLibraryError(String(error?.message || error));
    } finally {
      if (open) { libraryBusy = false; renderLibraries(); syncButtonState(); }
    }
  }
  function renderLibraries() {
    libraryList.replaceChildren();
    refreshButton = null;
    const records = libraries();
    for (const record of records) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'create-map-library-option';
      button.dataset.libraryId = record.id;
      button.setAttribute('aria-pressed', String(destination?.id === record.id));
      button.textContent = record.name;
      button.title = record.name;
      button.addEventListener('click', () => {
        if (!open || submitting || libraryBusy) return;
        setDestination(record);
        setListExpanded(false);
        setLibraryError('');
        libraryToggle.focus();
      });
      libraryList.appendChild(button);
    }
    if (!records.length) {
      const empty = document.createElement('p'); empty.className = 'create-map-library-empty';
      empty.textContent = 'No linked Map Libraries. Use + New to link one.';
      libraryList.appendChild(empty);
    }
    const refreshRow = document.createElement('div'); refreshRow.className = 'create-map-library-refresh';
    refreshButton = document.createElement('button'); refreshButton.type = 'button'; refreshButton.textContent = 'Refresh';
    refreshButton.addEventListener('click', () => { void refreshLibraries(); });
    refreshRow.appendChild(refreshButton);
    libraryList.appendChild(refreshRow);
    const current = destinationRecord();
    if (destination && !current) {
      setDestination(null);
      setLibraryError('The selected destination is no longer linked. Choose another Map Library.');
    } else if (destination && current && current.handle !== destination.handle) {
      setDestination(null);
      setLibraryError('The linked folder changed. Select the Library destination again.');
    } else if (current) {
      destination.name = current.name;
      destinationName.textContent = current.name;
      destinationName.title = current.name;
    }
    updateOptionStates();
    libraryList.hidden = !listExpanded;
    libraryToggle.setAttribute('aria-expanded', String(listExpanded));
    syncButtonState();
  }
  function syncButtonState() {
    const busy = submitting || preparing || composing || libraryBusy || descriptionComposing;
    const confirmation = open && !confirm.hidden;
    cancelButton.disabled = !open || submitting || libraryBusy;
    confirmCancelButton.disabled = !open || submitting || libraryBusy;
    nameInput.disabled = !open || submitting;
    descriptionInput.disabled = !open || submitting;
    libraryToggle.disabled = !open || busy;
    newButton.disabled = !open || busy;
    if (refreshButton) refreshButton.disabled = !open || busy;
    createButton.disabled = !open || !previewData || !destination || busy || confirmation;
    backButton.disabled = !confirmation || !previewData || submitting;
    replaceButton.disabled = !confirmation || !previewData || submitting;
    for (const button of libraryList.children || []) if (button.tagName === 'BUTTON' && button !== refreshButton) button.disabled = !open || busy;
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
    if (!result?.ok) {
      clearPreview();
      if (result?.field === 'description') descriptionError.textContent = result.message || 'The description is invalid.';
      else setStatus(result?.message || 'The map could not be prepared.', 'error');
      return;
    }
    previewData = result;
    setStatus('');
    syncButtonState();
  }
  async function updateName() {
    const token = beginPrepare();
    try {
      const checked = validateName(nameInput.value);
      nameError.textContent = checked.ok ? '' : checked.message;
      clearPreview();
      updateDescriptionCount();
      if (!ownsPrepare(token)) return;
      if (!checked.ok) { setStatus(''); return; }
      const desc = checkDescription(descriptionInput.value);
      descriptionError.textContent = desc.ok ? '' : desc.message;
      if (!desc.ok) { setStatus(''); return; }
      if (typeof onNameChange !== 'function') { return; }
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
  descriptionInput.addEventListener('input', (event) => {
    updateDescriptionCount();
    if (descriptionComposing || event.isComposing) return;
    const checked = checkDescription(descriptionInput.value);
    descriptionError.textContent = checked.ok ? '' : checked.message;
    if (checked.ok) updateName(); else clearPreview();
  });
  nameInput.addEventListener('compositionstart', () => { composing = true; syncButtonState(); });
  nameInput.addEventListener('compositionend', () => { composing = false; syncButtonState(); updateName(); });
  descriptionInput.addEventListener('compositionstart', () => { descriptionComposing = true; syncButtonState(); });
  descriptionInput.addEventListener('compositionend', () => { descriptionComposing = false; syncButtonState(); updateName(); });

  libraryToggle.addEventListener('click', () => {
    if (!open || submitting || libraryBusy) return;
    setListExpanded(!listExpanded);
    if (listExpanded) {
      const first = [...libraryList.children].find((node) => node.tagName === 'BUTTON');
      (first || refreshButton)?.focus?.();
    }
  });
  newButton.addEventListener('click', async () => {
    if (!open || submitting || libraryBusy || typeof onLinkLibrary !== 'function') return;
    libraryBusy = true; syncButtonState(); setLibraryError('');
    try {
      const result = await onLinkLibrary();
      if (!open) return;
      if (result?.ok && result.library) {
        renderLibraries();
        setDestination(result.library);
        setListExpanded(false);
      } else if (result?.reason !== 'cancelled' && result?.reason !== 'stale') {
        setLibraryError(String(result?.message || 'The folder could not be linked.'));
      }
    } catch (error) {
      if (open) setLibraryError(String(error?.message || error));
    } finally {
      if (open) { libraryBusy = false; renderLibraries(); syncButtonState(); }
    }
  });

  const isVisible = (el) => isFocusableElement(el, document);
  const focusables = () => {
    const list = confirm.hidden
      ? [nameInput, descriptionInput, libraryToggle, newButton, ...(libraryList.children || []), cancelButton, createButton]
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
    const liveDescription = checkDescription(descriptionInput.value);
    descriptionError.textContent = liveDescription.ok ? '' : liveDescription.message;
    if (!liveDescription.ok) { setStatus(''); syncButtonState(); return; }
    const liveName = validateName(nameInput.value);
    nameError.textContent = liveName.ok ? '' : liveName.message;
    if (!liveName.ok) { setStatus(''); syncButtonState(); return; }
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
    const liveDescription = checkDescription(descriptionInput.value);
    descriptionError.textContent = liveDescription.ok ? '' : liveDescription.message;
    if (!liveDescription.ok) { setStatus(''); syncButtonState(); return; }
    const liveName = validateName(nameInput.value);
    nameError.textContent = liveName.ok ? '' : liveName.message;
    if (!liveName.ok) { setStatus(''); syncButtonState(); return; }
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
    open = false; sessionSeq += 1; submitting = false; libraryBusy = false; abandonPreparation(); composing = false; descriptionComposing = false;
    backdrop.hidden = true; clearPreview(); setDestination(null); nameInput.value = ''; descriptionInput.value = '';
    nameError.textContent = ''; descriptionError.textContent = ''; setLibraryError(''); updateDescriptionCount();
    confirm.hidden = true; form.hidden = false; actions.hidden = false; setListExpanded(false);
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
    open = true; sessionSeq += 1; submitting = false; preparing = false; composing = false; descriptionComposing = false; libraryBusy = false;
    activePrepare = null; previewData = null; nameInput.value = ''; descriptionInput.value = '';
    nameError.textContent = ''; descriptionError.textContent = ''; setLibraryError(''); updateDescriptionCount();
    confirm.hidden = true; form.hidden = false; actions.hidden = false;
    destination = null;
    setListExpanded(false);
    renderLibraries();
    const preferredId = getDefaultLibraryId?.();
    const preferred = preferredId ? libraries().find((record) => record.id === preferredId) : null;
    if (preferred) setDestination(preferred); else setDestination(null);
    setListExpanded(false);
    syncButtonState();
    setStatus('');
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


