import { isFocusableElement } from './shell-controls.js';
import { validateName, validateDescription } from '../../../src/engine/hypertree/editor/validation.js';
export function createCreateMapDialog({ document, host, onSelection, onNameChange = null, onCreate, onCancel, getFallbackFocus = () => null, hasCurrentMap = () => true, getSaveLocation = () => ({ connected: false, name: '', mode: 'standalone', supported: false }), onChooseFolder = null, onSaveElsewhere = null, onUseOrbit = null }) {
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
  note.textContent = 'Add a title, an optional description, and optionally a source folder. Files are never uploaded; browser storage can be cleared.';
  const form = document.createElement('div'); form.className = 'create-map-form';
  const nameLabel = document.createElement('label'); nameLabel.textContent = 'Map title';
  const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.maxLength = 200; nameInput.autocomplete = 'off';
  const nameError = document.createElement('p'); nameError.className = 'create-map-name-error'; nameError.setAttribute('role', 'alert');
  nameLabel.appendChild(nameInput);
  const descriptionLabel = document.createElement('label'); descriptionLabel.textContent = 'Map description (optional)';
  const descriptionInput = document.createElement('textarea'); descriptionInput.rows = 4; descriptionInput.maxLength = 2000; descriptionInput.className = 'create-map-description';
  const descriptionError = document.createElement('p'); descriptionError.className = 'create-map-name-error'; descriptionError.setAttribute('role', 'alert');
  descriptionLabel.appendChild(descriptionInput);
  const fileButton = document.createElement('button'); fileButton.type = 'button'; fileButton.textContent = 'Select files (optional)';
  const folderButton = document.createElement('button'); folderButton.type = 'button'; folderButton.textContent = 'Select folder (optional)';
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.multiple = true; fileInput.hidden = true;
  const folderInput = document.createElement('input'); folderInput.type = 'file'; folderInput.multiple = true; folderInput.hidden = true; folderInput.setAttribute('webkitdirectory', '');
  const drop = document.createElement('div'); drop.className = 'create-map-drop'; drop.tabIndex = 0;
  drop.textContent = 'Drop files or folders here (optional; browser support varies)';
  const infoHeading = document.createElement('h3'); infoHeading.textContent = 'Map Information';
  const sourceDetails = document.createElement('details'); sourceDetails.className = 'create-map-source';
  const sourceSummary = document.createElement('summary'); sourceSummary.textContent = 'Add a source folder — optional';
  const sourceNote = document.createElement('p'); sourceNote.className = 'create-map-source-note'; sourceNote.textContent = 'Add the contents of a folder to your map, or leave this empty and add items later.';
  sourceDetails.append(sourceSummary, sourceNote);
  const libraryHeading = document.createElement('h3'); libraryHeading.textContent = 'Map Library Setting';
  const libraryGuidance = document.createElement('p'); libraryGuidance.className = 'create-map-location-guidance'; libraryGuidance.textContent = 'Choose an existing folder. If your system picker offers New Folder, you can create one there. Otherwise, create the folder in your file manager first.';
  const locationLabel = document.createElement('p'); locationLabel.className = 'create-map-location-label'; locationLabel.textContent = 'Map Library directory';
  const locationRow = document.createElement('div'); locationRow.className = 'create-map-location';
  const locationName = document.createElement('span'); locationName.className = 'create-map-location-name';
  const changeFolderButton = document.createElement('button'); changeFolderButton.type = 'button'; changeFolderButton.textContent = 'Choose save location';
  const saveElsewhereButton = document.createElement('button'); saveElsewhereButton.type = 'button'; saveElsewhereButton.textContent = 'Save elsewhere…';
  const useOrbitButton = document.createElement('button'); useOrbitButton.type = 'button'; useOrbitButton.textContent = 'Use connected Orbit'; useOrbitButton.hidden = true;
  locationRow.append(locationName, changeFolderButton, saveElsewhereButton, useOrbitButton);
  const locationNote = document.createElement('p'); locationNote.className = 'create-map-location-note';
  const preview = document.createElement('div'); preview.className = 'create-map-preview'; preview.setAttribute('aria-label', 'Map preview');
  const status = document.createElement('p'); status.className = 'create-map-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'create-map-actions';
  const cancelButton = document.createElement('button'); cancelButton.type = 'button'; cancelButton.textContent = 'Cancel';
  const createButton = document.createElement('button'); createButton.type = 'button'; createButton.textContent = 'Create Map'; createButton.disabled = true;
  const confirm = document.createElement('div'); confirm.className = 'create-map-confirm'; confirm.hidden = true;
  const confirmText = document.createElement('p'); confirmText.textContent = 'Replace the current map and clear its session history?';
  const confirmActions = document.createElement('div'); confirmActions.className = 'create-map-actions';
  const confirmCancelButton = document.createElement('button'); confirmCancelButton.type = 'button'; confirmCancelButton.textContent = 'Cancel';
  const backButton = document.createElement('button'); backButton.type = 'button'; backButton.textContent = 'Back';
  const replaceButton = document.createElement('button'); replaceButton.type = 'button'; replaceButton.textContent = 'Replace map';
  confirmActions.append(confirmCancelButton, backButton, replaceButton); confirm.append(confirmText, confirmActions);
  fileButton.addEventListener('click', () => fileInput.click());
  folderButton.addEventListener('click', () => folderInput.click());
  changeFolderButton.addEventListener('click', async () => {
    if (!open || submitting || locationBusy || typeof onChooseFolder !== 'function' || changeFolderButton.disabled) return;
    locationBusy = true; syncButtonState(); setStatus('Opening folder…');
    try {
      const result = await onChooseFolder();
      if (!open) return;
      if (result?.ok) {
        const location = getSaveLocation?.() || {};
        const name = String(result?.name || location.name || 'selected folder');
        setStatus(`Save location selected: ${name}.`, 'ok');
      }
      else if (!result?.stale) setStatus(String(result?.message || 'The folder could not be selected.'), 'error');
    } catch (error) {
      if (open) setStatus(String(error?.message || error), 'error');
    } finally {
      if (open) { locationBusy = false; syncButtonState(); }
    }
  });
  saveElsewhereButton.addEventListener('click', () => {
    if (!open || submitting || locationBusy || typeof onSaveElsewhere !== 'function') return;
    onSaveElsewhere();
    setStatus('This map will be saved as a standalone file.', 'info');
    syncButtonState();
  });
  useOrbitButton.addEventListener('click', () => {
    if (!open || submitting || locationBusy || typeof onUseOrbit !== 'function') return;
    const result = onUseOrbit();
    if (result?.ok) setStatus('This map will be saved in the connected folder.', 'ok');
    else setStatus(String(result?.message || 'The connected folder is not available.'), 'error');
    syncButtonState();
  });
  sourceDetails.append(folderButton);
  form.append(infoHeading, nameLabel, nameError, descriptionLabel, descriptionError, sourceDetails, preview, libraryHeading, locationLabel, locationRow, locationNote, libraryGuidance);
  actions.append(cancelButton, createButton);
  dialog.append(title, note, form, folderInput, status, actions, confirm);
  backdrop.appendChild(dialog); host.appendChild(backdrop);

  let open = false;
  let retainedSelection = null;
  let nameSeq = 0;
  let composing = false;
  let previewData = null;
  let selectionSeq = 0;
  let submitting = false;
  let prepareSeq = 0;
  let activePrepare = null;
  let sessionSeq = 0;
  let lastFocus = null;
  let dragDepth = 0;
  let locationBusy = false;

  const setStatus = (message, kind = 'info') => { status.textContent = message; status.dataset.kind = kind; };
  const ownsPrepare = (token) => Boolean(token && token === activePrepare && token.session === sessionSeq && open);
  const updateLocation = () => {
    const location = getSaveLocation?.() || {};
    const supported = Boolean(location.supported);
    const connected = Boolean(location.connected);
    const mode = connected && location.mode === 'orbit' ? 'orbit' : 'standalone';
    const name = mode === 'orbit' ? String(location.name || 'Connected Orbit') : 'Standalone file (choose when creating)';
    locationName.textContent = name;
    locationName.title = name;
    changeFolderButton.textContent = connected ? 'Change save location' : 'Choose save location';
    changeFolderButton.disabled = !open || submitting || locationBusy || !supported;
    saveElsewhereButton.disabled = !open || submitting || locationBusy;
    saveElsewhereButton.setAttribute('aria-pressed', String(mode === 'standalone'));
    useOrbitButton.hidden = !(connected && mode === 'standalone');
    useOrbitButton.disabled = !open || submitting || locationBusy;
    locationNote.textContent = !supported
      ? 'Folder-based saving is not available in this browser. You can still create a standalone map.'
      : !connected
        ? 'Choose the folder where your maps will be saved. Map files may not appear in the folder selection window.'
        : mode === 'orbit'
          ? 'New maps will be saved in this folder.'
          : 'This map will be saved as a standalone file.';
  };
  function syncButtonState() {
    const confirmation = open && !confirm.hidden;
    const validPreview = open && Boolean(previewData);
    const preparing = Boolean(activePrepare?.pending);
    const busy = submitting || preparing || composing;
    cancelButton.disabled = !open;
    confirmCancelButton.disabled = !open;
    nameInput.disabled = !open || submitting;
    descriptionInput.disabled = !open || submitting;
    fileButton.disabled = !open || submitting || preparing;
    folderButton.disabled = !open || submitting || preparing;
    drop.tabIndex = open && !submitting ? 0 : -1;
    createButton.disabled = !validPreview || busy || confirmation;
    backButton.disabled = !confirmation || !previewData || submitting;
    replaceButton.disabled = !confirmation || !previewData || submitting;
    updateLocation();
  }
  function beginPrepare() {
    prepareSeq += 1;
    const token = { seq: prepareSeq, session: sessionSeq, pending: true };
    activePrepare = token;
    syncButtonState();
    return token;
  }
  function endPrepare(token) {
    if (!token || token !== activePrepare) return;
    token.pending = false;
    activePrepare = null;
    syncButtonState();
  }
  function abandonPreparation() {
    if (activePrepare) activePrepare.pending = false;
    activePrepare = null;
    syncButtonState();
  }
  const clearPreview = () => { previewData = null; preview.replaceChildren(); preview.hidden = true; syncButtonState(); };
  const rowFor = (node, depth) => {
    const row = document.createElement('div'); row.className = 'create-map-row'; row.style.paddingLeft = `${Math.min(depth, 12) * 10}px`;
    const icon = document.createElement('span'); icon.textContent = node.kind === 'folder' ? '▸' : '•';
    const name = document.createElement('span'); name.textContent = node.name;
    row.append(icon, name); return row;
  };
  function renderPreview(result) {
    preview.replaceChildren();
    if (!result?.ok) { clearPreview(); return; }
    previewData = result; syncButtonState();
    const rows = [];
    const walk = (node, depth) => { if (rows.length >= 100) return; rows.push({ node, depth }); for (const child of node.children || []) walk(child, depth + 1); };
    walk(result.tree, 0);
    for (const { node, depth } of rows) preview.appendChild(rowFor(node, depth));
    if (rows.length === 100) { const more = document.createElement('p'); more.textContent = 'Preview limited to 100 items.'; preview.appendChild(more); }
    const stats = result.stats;
    setStatus(`${Math.max(0, stats.folderCount - 1)} folders, ${stats.fileCount} files, ${stats.totalBytes} bytes. Review, then choose Create Map.`, 'ok');
  }
  async function choose(files, folders = []) {
    const seq = ++selectionSeq;
    const token = beginPrepare();
    retainedSelection = { files, folders };
    clearPreview(); setStatus('Preparing preview…');
    try {
      const result = await onSelection({ mapName: nameInput.value, description: descriptionInput.value, files, folders, selectionSeq: seq });
      if (!ownsPrepare(token)) return;
      if (!result?.ok) setStatus(result?.message || 'The selection could not be prepared.', 'error');
      else renderPreview(result);
    } catch (error) {
      if (ownsPrepare(token)) setStatus(String(error?.message || error), 'error');
    } finally {
      endPrepare(token);
    }
  }
  async function updateName() {
    const token = beginPrepare();
    try {
      const checked = validateName(nameInput.value);
      nameError.textContent = checked.ok ? '' : checked.message;
      nameSeq += 1;
      clearPreview();
      if (!ownsPrepare(token)) return;
      if (!checked.ok) {
        setStatus(checked.message, 'error');
        return;
      }
      if (typeof onNameChange !== 'function') { setStatus('Enter a map title to preview a new map.'); return; }
      const seq = nameSeq;
      const selection = retainedSelection || { files: [], folders: [] };
      setStatus('Updating preview…');
      try {
        const result = await onNameChange({ mapName: checked.name, description: descriptionInput.value, selection, nameSeq: seq });
        if (!ownsPrepare(token) || seq !== nameSeq) return;
        if (!result?.ok) setStatus(result?.message || 'The map title could not be applied.', 'error');
        else { retainedSelection = result.selection || retainedSelection; renderPreview(result); }
      } catch (error) {
        if (ownsPrepare(token) && seq === nameSeq) setStatus(String(error?.message || error), 'error');
      }
    } finally { endPrepare(token); }
  }
  nameInput.addEventListener('input', (event) => { if (!composing && !event.isComposing) updateName(); });
  descriptionInput.addEventListener('input', () => {
    const checked = validateDescription(descriptionInput.value);
    descriptionError.textContent = checked.ok ? '' : checked.message;
    if (checked.ok) updateName();
  });
  nameInput.addEventListener('compositionstart', () => { composing = true; syncButtonState(); });
  nameInput.addEventListener('compositionend', () => { composing = false; syncButtonState(); updateName(); });  const filesFromPicker = (input) => [...input.files].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
  fileInput.addEventListener('change', () => { choose(filesFromPicker(fileInput), []); fileInput.value = ''; });
  folderInput.addEventListener('change', () => { choose(filesFromPicker(folderInput), []); folderInput.value = ''; });
  const onDragEnter = (event) => { event.preventDefault(); dragDepth += 1; drop.dataset.active = 'true'; };
  const onDragOver = (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; };
  const onDragLeave = (event) => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) delete drop.dataset.active; };
  const onDrop = (event) => {
    event.preventDefault(); event.stopPropagation(); dragDepth = 0; delete drop.dataset.active;
    const transfer = event.dataTransfer;
    const capture = transfer?.items ? [...transfer.items] : [];
    const entries = [];
    const files = [];
    for (const item of capture) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry); else { const file = item.getAsFile?.(); if (file) files.push({ file, relativePath: file.webkitRelativePath || file.name }); }
    }
    if (entries.length === 0 && files.length === 0) {
      if (transfer?.files?.length) for (const file of transfer.files) files.push({ file, relativePath: file.name });
      else { setStatus('Only files and folders can be added. Text and links are ignored.', 'error'); return; }
    }
    if (entries.length) {
      const seq = ++selectionSeq;
      const token = beginPrepare();
      clearPreview(); setStatus('Reading dropped folders…');
      onDropEntries({ entries, mapName: nameInput.value, selectionSeq: seq }).then((result) => {
        if (!ownsPrepare(token)) return;
        if (!result?.ok) setStatus(result?.message || 'The dropped items could not be read.', 'error');
        else { if (result.selection) retainedSelection = result.selection; renderPreview(result); }
      }).catch((error) => {
        if (ownsPrepare(token)) setStatus(String(error?.message || error), 'error');
      }).finally(() => endPrepare(token));
      return;
    }
    choose(files, []);
  };
  let onDropEntries = async () => ({ ok: false, message: 'Dropped folders are not supported in this browser.' });
  drop.addEventListener('dragenter', onDragEnter); drop.addEventListener('dragover', onDragOver); drop.addEventListener('dragleave', onDragLeave); drop.addEventListener('drop', onDrop);

  const isVisible = (el) => isFocusableElement(el, document);
  const focusables = () => {
    const list = confirm.hidden
      ? [nameInput, descriptionInput, folderButton, changeFolderButton, saveElsewhereButton, useOrbitButton, cancelButton, createButton]
      : [confirmCancelButton, backButton, replaceButton];
    return list.filter((el) => isVisible(el));
  };
  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const list = focusables(); if (list.length === 0) return;
    const first = list[0]; const last = list.at(-1);
    if (!list.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  cancelButton.addEventListener('click', () => close());
  confirmCancelButton.addEventListener('click', () => close());
  backButton.addEventListener('click', () => {
    if (!open || submitting || confirm.hidden || !previewData) return;
    confirm.hidden = true; form.hidden = false; preview.hidden = false; actions.hidden = false;
    syncButtonState();
    (createButton.disabled ? nameInput : createButton).focus();
  });
  async function submitCreation() {
    if (!open || !previewData || submitting) return;
    const session = sessionSeq;
    const candidate = previewData;
    submitting = true; setStatus('Creating map…'); syncButtonState(); confirmCancelButton.focus();
    try {
      const outcome = await onCreate(candidate);
      if (!open || session !== sessionSeq) return;
      if (outcome?.stale) return;
      if (outcome && outcome.ok === false) {
        setStatus(String(outcome.message || 'The map could not be created.'), 'error');
        if (outcome.keepDraft) { previewData = candidate; }
        else if (outcome.reason === 'zero-viewport') {
          confirm.hidden = true; form.hidden = false; preview.hidden = false; actions.hidden = false;
        } else previewData = null;
      } else previewData = null;
    } catch (error) {
      if (open && session === sessionSeq) setStatus(String(error?.message || error), 'error');
    } finally {
      if (session === sessionSeq) { submitting = false; syncButtonState(); }
    }
  }
  createButton.addEventListener('click', () => {
    if (!open || !previewData || submitting || !confirm.hidden) return;
    if (!hasCurrentMap()) { submitCreation(); return; }
    confirm.hidden = false; form.hidden = true; preview.hidden = true; actions.hidden = true;
    syncButtonState(); replaceButton.focus();
  });
  replaceButton.addEventListener('click', () => {
    if (!open || !previewData || submitting) return;
    submitCreation();
  });
  function close({ restoreFocus = true } = {}) {
    if (!open) return;
    open = false; sessionSeq += 1; submitting = false; abandonPreparation(); composing = false;
    locationBusy = false;
    backdrop.hidden = true; selectionSeq += 1; nameSeq += 1; previewData = null; retainedSelection = null;
    syncButtonState();
    onCancel?.();
    if (restoreFocus) {
      const candidate = isVisible(lastFocus) ? lastFocus : getFallbackFocus?.();
      const target = isVisible(candidate) ? candidate : getFallbackFocus?.();
      if (isVisible(target)) target.focus();
    }
  }
  function show() {
    if (open) return;
    open = true; sessionSeq += 1; submitting = false; activePrepare = null; composing = false; locationBusy = false; previewData = null; retainedSelection = null; nameSeq += 1; nameInput.value = ''; nameError.textContent = '';
    fileInput.value = ''; folderInput.value = ''; preview.replaceChildren(); preview.hidden = true; confirm.hidden = true; form.hidden = false; preview.hidden = false; actions.hidden = false;
    updateLocation();
    syncButtonState();
    setStatus('Enter a map title. A description and source folder are optional.'); backdrop.hidden = false; lastFocus = document.activeElement || null; nameInput.focus();
  }
  return {
    element: backdrop, show, close, get open() { return open; },
    refreshSaveLocation() { updateLocation(); },
    setDropEntryHandler(handler) { onDropEntries = handler; },
    destroy() { close({ restoreFocus: false }); document.removeEventListener('keydown', onKey); backdrop.remove(); }
  };
}




















