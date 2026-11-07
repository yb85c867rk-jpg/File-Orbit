import { isFocusableElement } from './shell-controls.js';

/**
 * Centered preview for a prepared local upload. The dialog never installs or
 * mutates the map; onAdd/onChooseAgain/onCancel remain owned by main.
 */
export function createUploadPreviewDialog({ document, host, onAdd, onChooseAgain, onCancel, onExportDiagnostic } = {}) {
  if (!document || !host) throw new Error('upload preview requires document and host');
  const backdrop = document.createElement('div');
  backdrop.className = 'upload-preview-backdrop';
  backdrop.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'upload-preview-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'upload-preview-title');
  dialog.setAttribute('aria-describedby', 'upload-preview-summary');
  const title = document.createElement('h2'); title.id = 'upload-preview-title'; title.textContent = 'Upload';
  const destination = document.createElement('p'); destination.className = 'upload-preview-destination';
  const summary = document.createElement('p'); summary.id = 'upload-preview-summary'; summary.className = 'upload-preview-summary';
  const limitation = document.createElement('p'); limitation.className = 'upload-preview-limitation'; limitation.hidden = true;
  const error = document.createElement('p'); error.className = 'upload-preview-error'; error.setAttribute('role', 'alert'); error.hidden = true;
  const actions = document.createElement('div'); actions.className = 'upload-preview-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  const chooseAgain = document.createElement('button'); chooseAgain.type = 'button'; chooseAgain.textContent = 'Choose Again'; chooseAgain.hidden = true;
  const diagnostic = document.createElement('button'); diagnostic.type = 'button'; diagnostic.textContent = 'Export structure diagnostic'; diagnostic.hidden = true;
  const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add to Map'; add.disabled = true;
  actions.append(cancel, chooseAgain, diagnostic, add);
  dialog.append(title, destination, summary, limitation, error, actions);
  backdrop.append(dialog); host.append(backdrop);

  let open = false;
  let busy = false;
  let lastFocus = null;
  let current = null;

  const sync = () => {
    cancel.disabled = !open || busy;
    chooseAgain.disabled = !open || busy;
    diagnostic.disabled = !open || busy || !current?.preparation;
    add.disabled = !open || busy || !current?.preparation;
    dialog.setAttribute('aria-busy', String(busy));
  };
  const setError = (message) => { error.textContent = message || ''; error.hidden = !message; };
  const close = ({ notify = true, restoreFocus = true } = {}) => {
    if (!open || busy) return false;
    open = false; current = null;
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (notify) onCancel?.();
    if (restoreFocus) {
      try { if (isFocusableElement(lastFocus, document)) lastFocus.focus(); } catch {}
    }
    lastFocus = null; sync();
    return true;
  };
  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); if (!busy) close(); return; }
    if (event.key !== 'Tab') return;
    const list = [cancel, chooseAgain, diagnostic, add].filter((button) => !button.hidden && !button.disabled);
    if (!list.length) return;
    const first = list[0], last = list.at(-1);
    if (!list.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  add.addEventListener('click', async () => {
    if (!open || busy || !current?.preparation || typeof onAdd !== 'function') return;
    busy = true; sync(); setError('');
    try {
      const result = await onAdd(current);
      if (!open) return;
      if (result?.ok) { busy = false; close({ notify: false, restoreFocus: true }); return; }
      busy = false; sync();
      if (result?.stale) { close({ notify: true }); return; }
      if (result?.diagnostics && current?.preparation) { current.diagnostics = result.diagnostics; diagnostic.hidden = false; }
      setError(String(result?.message || 'The upload could not be added.'));
      sync();
    } catch (err) {
      busy = false; sync(); setError(String(err?.message || err));
    }
  });
  chooseAgain.addEventListener('click', () => {
    if (!open || busy || typeof onChooseAgain !== 'function') return;
    const context = current?.context || null;
    close({ notify: true });
    onChooseAgain(context);
  });
  cancel.addEventListener('click', () => { if (!busy) close(); });
  diagnostic.addEventListener('click', () => { if (open && !busy && current?.preparation) onExportDiagnostic?.(current); });
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop && !busy) close(); });

  function show({ folderName, destinationPath, preparation = null, error: message = '', limitation: limitationText = '', context = null } = {}) {
    if (open) return false;
    open = true; busy = false; current = { folderName, destinationPath, preparation, context };
    title.textContent = 'Upload to ' + String(folderName || 'folder');
    destination.textContent = 'Destination: ' + String(destinationPath || folderName || 'folder');
    if (preparation?.summary) {
      const s = preparation.summary;
      summary.textContent = `${s.addedFolderCount} folders, ${s.addedFileCount} files added. Result: ${s.resultingNodeCount} / ${s.nodeLimit} nodes. Attachments: ${s.addedAttachmentBytes} bytes.`;
      limitation.hidden = s.folderListingComplete !== false;
      limitation.textContent = s.folderListingComplete === false
        ? 'This browser picker does not expose empty folders; empty source folders may be omitted.'
        : '';
    } else {
      summary.textContent = 'No addition is ready.';
      limitation.hidden = true; limitation.textContent = '';
    }
    add.hidden = !preparation;
    chooseAgain.hidden = Boolean(preparation);
    diagnostic.hidden = true;
    setError(message);
    sync();
    backdrop.hidden = false;
    lastFocus = document.activeElement || null;
    document.addEventListener('keydown', onKey, true);
    (preparation ? add.focus() : chooseAgain.focus());
    return true;
  }

  return {
    show, close,
    get open() { return open; },
    get busy() { return busy; },
    setError,
    element: backdrop,
    destroy() { if (open) close({ notify: false, restoreFocus: false }); backdrop.remove(); }
  };
}
