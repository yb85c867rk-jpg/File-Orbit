/** Owned confirmation dialog for deletion. Opening/cancelling never mutates. */
export function createDeleteConfirmation({ document, host = document?.body, onConfirm = () => {}, onCancel = () => {}, onExportDiagnostic = null, onClosed = null } = {}) {
  if (!document || !host) throw new Error('document and host are required');
  const overlay = document.createElement('div');
  overlay.className = 'delete-confirm-backdrop';
  overlay.hidden = true;
  const dialog = document.createElement('div');
  dialog.className = 'delete-confirm';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'delete-confirm-title');
  const title = document.createElement('h2');
  title.id = 'delete-confirm-title';
  title.textContent = 'Confirm delete';
  const name = document.createElement('p');
  const summary = document.createElement('p');
  const note = document.createElement('p');
  note.textContent = 'This removes items from the current FileOrbit session. You can undo this action.';
  const actions = document.createElement('div');
  actions.className = 'delete-confirm-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = 'Delete';
  const diagnostic = document.createElement('button'); diagnostic.type = 'button'; diagnostic.textContent = 'Export structure diagnostic'; diagnostic.hidden = true;
  const error = document.createElement('p');
  error.className = 'delete-confirm-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  actions.append(cancel, confirm, diagnostic);
  dialog.append(title, name, summary, note, actions, error);
  overlay.appendChild(dialog); host.appendChild(overlay);

  let pending = null;
  let trigger = null;
  let abort = null;
  let busy = false;
  let lastFailure = null;

  const setError = (message) => { error.textContent = message || ''; error.hidden = !message; };
  const sync = () => {
    cancel.disabled = busy;
    confirm.disabled = busy || !pending;
    diagnostic.disabled = busy || !lastFailure;
    dialog.setAttribute('aria-busy', String(busy));
  };
  function close({ restoreFocus = true } = {}) {
    if (busy) return false;
    if (abort) { abort.abort(); abort = null; }
    const focus = trigger;
    overlay.hidden = true;
    pending = null; lastFailure = null; busy = false;
    setError(''); diagnostic.hidden = true; sync();
    trigger = null;
    if (restoreFocus && focus?.focus) focus.focus();
    onClosed?.();
    return true;
  }
  function open({ target, folders = 0, files = 0, datasetToken, baseRevision, parentId = null }) {
    if (!target?.id || !target.name) return false;
    close({ restoreFocus: false });
    trigger = document.activeElement || null;
    pending = { target: { ...target }, folders, files, datasetToken, baseRevision, parentId };
    lastFailure = null; busy = false;
    diagnostic.hidden = true; setError('');
    name.textContent = target.name;
    summary.textContent = target.kind === 'folder'
      ? `${folders} folder${folders === 1 ? '' : 's'} and ${files} data item${files === 1 ? '' : 's'} will be removed, including “${target.name}”.`
      : `This data item will be removed: “${target.name}”.`;
    overlay.hidden = false;
    abort = new AbortController();
    const signal = abort.signal;
    cancel.addEventListener('click', () => { if (!busy) { close(); onCancel(); } }, { signal });
    confirm.addEventListener('click', async () => {
      if (!pending || busy) return;
      const value = pending;
      busy = true; setError(''); sync();
      let result;
      try {
        result = await onConfirm(value);
      } catch (failure) {
        result = { ok: false, message: String(failure?.message || failure), error: failure };
      }
      if (!abort) return;
      if (result?.ok !== false) { busy = false; close(); return; }
      lastFailure = result;
      busy = false;
      diagnostic.hidden = typeof onExportDiagnostic !== 'function';
      setError(String(result?.message || 'The deletion failed. The map was preserved.'));
      sync();
    }, { signal });
    diagnostic.addEventListener('click', () => {
      if (pending && lastFailure && typeof onExportDiagnostic === 'function') onExportDiagnostic(pending, lastFailure);
    }, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!busy) close();
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const items = [cancel, confirm, diagnostic].filter((button) => !button.hidden && !button.disabled);
      if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (!items.includes(document.activeElement)) { (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) last.focus();
      else if (!event.shiftKey && document.activeElement === last) first.focus();
    }, { capture: true, signal });
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay && !busy) close();
    }, { signal });
    cancel.focus();
    sync();
    return true;
  }

  return {
    open, close,
    get isOpen() { return Boolean(abort); },
    get pending() { return pending; },
    get busy() { return busy; },
    get failure() { return lastFailure; },
    setError,
    element: overlay,
    destroy() { if (!busy) close({ restoreFocus: false }); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
  };
}
