/** Confirmation for deleting exactly one linked Library .orbit file. */
export function createDeleteMapFileDialog({ document, host, onDelete, onCancel } = {}) {
  if (!document || !host) throw new Error('delete map file dialog requires document and host');
  const backdrop = document.createElement('div');
  backdrop.className = 'delete-map-file-backdrop';
  backdrop.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'delete-map-file-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'delete-map-file-title');
  dialog.setAttribute('aria-describedby', 'delete-map-file-copy');
  const title = document.createElement('h2');
  title.id = 'delete-map-file-title'; title.textContent = 'Delete this map file?';
  const name = document.createElement('p'); name.className = 'delete-map-file-name';
  const library = document.createElement('p'); library.className = 'delete-map-file-library';
  const copy = document.createElement('p'); copy.id = 'delete-map-file-copy';
  copy.textContent = 'This deletes the .orbit file from this folder. The Map Library and your original source files will remain.';
  const undo = document.createElement('p'); undo.className = 'delete-map-file-undo';
  undo.textContent = 'This file deletion cannot be undone with map Undo/Redo.';
  const error = document.createElement('p'); error.className = 'delete-map-file-error'; error.setAttribute('role', 'alert'); error.hidden = true;
  const actions = document.createElement('div'); actions.className = 'delete-map-file-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete File'; remove.className = 'delete-map-file-confirm';
  actions.append(cancel, remove);
  dialog.append(title, name, library, copy, undo, error, actions);
  backdrop.append(dialog); host.append(backdrop);
  let open = false; let busy = false; let target = null; let lastFocus = null; let onKey = null;
  const setError = (message = '') => { error.textContent = String(message || ''); error.hidden = !message; };
  const sync = () => { cancel.disabled = !open || busy; remove.disabled = !open || busy; backdrop.setAttribute('aria-busy', String(busy)); };
  function close({ restoreFocus = true } = {}) {
    if (!open || busy) return false;
    open = false; target = null; busy = false; backdrop.hidden = true; setError('');
    if (onKey) document.removeEventListener('keydown', onKey, true);
    onKey = null;
    const focus = lastFocus; lastFocus = null;
    if (restoreFocus && focus?.focus) focus.focus();
    return true;
  }
  function show({ filename, libraryName, returnFocus = null }) {
    if (open) return false;
    open = true; busy = false; target = { filename: String(filename || ''), libraryName: String(libraryName || '') };
    lastFocus = returnFocus || document.activeElement || null;
    name.textContent = target.filename;
    library.textContent = 'Library folder: ' + target.libraryName;
    setError(''); backdrop.hidden = false; sync();
    onKey = (event) => {
      if (!open) return;
      if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation?.(); close(); onCancel?.(); return; }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const items = [cancel, remove].filter((button) => !button.disabled);
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index < 0 || index === items.length - 1 ? 0 : index + 1);
      items[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    cancel.focus();
    return true;
  }
  cancel.addEventListener('click', () => { if (!busy) { close(); onCancel?.(); } });
  remove.addEventListener('click', async () => {
    if (!open || busy || !target) return;
    busy = true; setError(''); sync();
    try {
      const result = await onDelete?.({ ...target });
      if (!open) return;
      if (result?.ok) { busy = false; close({ restoreFocus: false }); return; }
      busy = false; setError(String(result?.message || 'The .orbit file could not be deleted.')); sync();
    } catch (failure) {
      if (!open) return;
      busy = false; setError(String(failure?.message || failure)); sync();
    }
  });
  return {
    show, close,
    setBusy(value) { busy = Boolean(value); sync(); },
    setError,
    get isOpen() { return open; },
    get busy() { return busy; },
    get target() { return target ? { ...target } : null; },
    element: backdrop,
    destroy() { if (!busy) close({ restoreFocus: false }); backdrop.remove(); }
  };
}

