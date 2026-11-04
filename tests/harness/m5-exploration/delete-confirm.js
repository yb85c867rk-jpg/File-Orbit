/** Owned confirmation dialog for deletion. Opening/cancelling never mutates. */
export function createDeleteConfirmation({ document, host = document?.body, onConfirm = () => {}, onCancel = () => {} }) {
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
  actions.appendChild(cancel); actions.appendChild(confirm);
  dialog.append(title, name, summary, note, actions);
  overlay.appendChild(dialog); host.appendChild(overlay);
  let pending = null; let trigger = null; let abort = null;
  function close({ restoreFocus = true } = {}) {
    if (abort) { abort.abort(); abort = null; }
    overlay.hidden = true;
    pending = null;
    if (restoreFocus && trigger?.focus) trigger.focus();
    trigger = null;
  }
  function open({ target, folders = 0, files = 0, datasetToken, baseRevision, parentId = null }) {
    if (!target?.id || !target.name) return false;
    close({ restoreFocus: false });
    trigger = document.activeElement || null;
    pending = { target: { ...target }, folders, files, datasetToken, baseRevision, parentId };
    name.textContent = target.name;
    summary.textContent = target.kind === 'folder'
      ? `${folders} folder${folders === 1 ? '' : 's'} and ${files} data item${files === 1 ? '' : 's'} will be removed, including “${target.name}”.`
      : `This data item will be removed: “${target.name}”.`;
    overlay.hidden = false;
    abort = new AbortController();
    const signal = abort.signal;
    cancel.addEventListener('click', () => { close(); onCancel(); }, { signal });
    confirm.addEventListener('click', () => { const value = pending; close(); if (value) onConfirm(value); }, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); onCancel(); return; }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const items = [cancel, confirm];
      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index < 0 || index === items.length - 1 ? 0 : index + 1);
      items[next].focus();
    }, { capture: true, signal });
    cancel.focus();
    return true;
  }
  return { open, close, get isOpen() { return Boolean(abort); }, get pending() { return pending; }, get element() { return overlay; }, destroy() { close({ restoreFocus: false }); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } };
}






