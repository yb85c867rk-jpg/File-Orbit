/** Explicit stale-generation resolution dialog. */
export function createSaveConflictDialog({ document, host, onReload, onSaveCopy, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'save-conflict-backdrop'; overlay.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'save-conflict-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'save-conflict-title');
  const title = document.createElement('h2'); title.id = 'save-conflict-title'; title.textContent = 'Save conflict';
  const message = document.createElement('p'); message.textContent = 'A newer saved version exists. Local changes were not overwritten.';
  const status = document.createElement('p'); status.className = 'save-conflict-status'; status.setAttribute('role', 'alert');
  const confirm = document.createElement('div'); confirm.className = 'save-conflict-confirm'; confirm.hidden = true;
  const confirmText = document.createElement('p'); confirmText.textContent = 'Reload the saved version and discard local committed changes?';
  const confirmActions = document.createElement('div'); confirmActions.className = 'save-conflict-actions';
  const confirmReload = document.createElement('button'); confirmReload.type = 'button'; confirmReload.textContent = 'Discard and reload';
  const keep = document.createElement('button'); keep.type = 'button'; keep.textContent = 'Keep editing';
  confirmActions.append(confirmReload, keep); confirm.append(confirmText, confirmActions);
  const actions = document.createElement('div'); actions.className = 'save-conflict-actions';
  const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = 'Reload saved version';
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Save as new copy';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  actions.append(reload, copy, cancel);
  dialog.append(title, message, status, confirm, actions); overlay.appendChild(dialog); host.appendChild(overlay);
  let open = false; let busy = false; let lastFocus = null; let onKey = null;
  const close = ({ restoreFocus = true } = {}) => { if (!open) return; open = false; overlay.hidden = true; busy = false; confirm.hidden = true; if (onKey) document.removeEventListener('keydown', onKey, true); onKey = null; if (restoreFocus && lastFocus?.focus) lastFocus.focus(); lastFocus = null; };
  const setBusy = (value) => { busy = Boolean(value); reload.disabled = busy; copy.disabled = busy; cancel.disabled = busy; confirmReload.disabled = busy; keep.disabled = busy; };
  const show = ({ message: text } = {}) => {
    if (open) return; open = true; lastFocus = document.activeElement || null; overlay.hidden = false; confirm.hidden = true; status.textContent = ''; setBusy(false);
    if (text) message.textContent = text;
    onKey = (event) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); onCancel?.(); } };
    document.addEventListener('keydown', onKey, true); reload.focus();
  };
  reload.addEventListener('click', () => { if (!busy) { confirm.hidden = false; confirmReload.focus(); } });
  keep.addEventListener('click', () => { if (!busy) { confirm.hidden = true; reload.focus(); } });
  confirmReload.addEventListener('click', async () => { if (busy) return; setBusy(true); try { await onReload?.(); } finally { setBusy(false); } });
  copy.addEventListener('click', async () => { if (busy) return; setBusy(true); status.textContent = 'Saving a new copy…'; try { await onSaveCopy?.(); } finally { setBusy(false); } });
  cancel.addEventListener('click', () => { if (!busy) { close(); onCancel?.(); } });
  return { show, close, setBusy, setError: (messageText) => { status.textContent = String(messageText || 'The conflict action failed.'); }, get isOpen() { return open; }, get element() { return overlay; }, destroy() { close({ restoreFocus: false }); overlay.remove(); } };
}
