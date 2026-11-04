/** Saved-map library dialog. Text-only rows; no tree payloads are rendered. */
export function createSavedMapsDialog({ document, host, onOpen, onDelete, onCancel, onPersist }) {
  const overlay = document.createElement('div');
  overlay.className = 'saved-maps-backdrop'; overlay.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'saved-maps-dialog';
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'saved-maps-title');
  const title = document.createElement('h2'); title.id = 'saved-maps-title'; title.textContent = 'Open saved map';
  const note = document.createElement('p'); note.className = 'saved-maps-note';
  note.textContent = 'Saved maps are stored in this browser on this device. They are not uploaded. Browser storage can be cleared.';
  const usage = document.createElement('div'); usage.className = 'saved-maps-usage';
  const appUsage = document.createElement('p'); const originUsage = document.createElement('p'); const persistedUsage = document.createElement('p');
  const persistButton = document.createElement('button'); persistButton.type = 'button'; persistButton.textContent = 'Request persistent storage';
  const persistStatus = document.createElement('p'); persistStatus.className = 'saved-maps-persist-status';
  usage.append(appUsage, originUsage, persistedUsage, persistButton, persistStatus);
  const status = document.createElement('p'); status.className = 'saved-maps-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const list = document.createElement('div'); list.className = 'saved-maps-list';
  const confirm = document.createElement('div'); confirm.className = 'saved-maps-confirm'; confirm.hidden = true;
  const confirmText = document.createElement('p');
  const confirmActions = document.createElement('div'); confirmActions.className = 'saved-maps-confirm-actions';
  const confirmDelete = document.createElement('button'); confirmDelete.type = 'button'; confirmDelete.textContent = 'Delete saved map';
  const confirmCancel = document.createElement('button'); confirmCancel.type = 'button'; confirmCancel.textContent = 'Keep map';
  confirmActions.append(confirmDelete, confirmCancel); confirm.append(confirmText, confirmActions);
  const actions = document.createElement('div'); actions.className = 'saved-maps-actions';
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = 'Close';
  actions.append(closeButton);
  dialog.append(title, note, usage, status, list, confirm, actions);
  overlay.appendChild(dialog); host.appendChild(overlay);
  let open = false; let busy = false; let lastFocus = null; let onKey = null; let pendingDelete = null; let records = [];
  const formatDate = (value) => {
    try { return new Date(value).toLocaleString(); } catch { return String(value || ''); }
  };
  const formatBytes = (bytes) => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  };
  const setBusy = (value) => {
    busy = Boolean(value);
    for (const button of dialog.querySelectorAll?.('button') || []) button.disabled = busy;
    if (!busy) render();
  };
  const close = ({ restoreFocus = true, notify = true } = {}) => {
    if (!open) return;
    open = false; overlay.hidden = true; busy = false; pendingDelete = null; confirm.hidden = true;
    if (onKey) document.removeEventListener('keydown', onKey, true);
    onKey = null;
    if (restoreFocus && lastFocus?.focus) lastFocus.focus();
    lastFocus = null;
    if (notify) onCancel?.();
  };
  const formatUsage = (value) => { const number = Number(value); return Number.isFinite(number) ? formatBytes(number) : 'unknown'; };
  let usageState = null;
  const renderUsage = () => {
    if (!usageState) { appUsage.textContent = 'Application attachment usage: unavailable'; originUsage.textContent = 'Browser origin estimate: unavailable'; persistedUsage.textContent = 'Persistent storage: unknown'; return; }
    appUsage.textContent = 'Application attachment usage: ' + formatBytes(usageState.storedAttachmentBytes) + ' / ' + formatBytes(usageState.libraryHardCapBytes);
    const estimate = usageState.estimate || {};
    originUsage.textContent = estimate.status === 'available' && Number.isFinite(estimate.usage) && Number.isFinite(estimate.quota)
      ? 'Browser origin estimate (may include other data): ' + formatBytes(estimate.usage) + ' used / ' + formatBytes(estimate.quota) + ' quota'
      : 'Browser origin estimate: unavailable';
    persistedUsage.textContent = estimate.persisted === true ? 'Persistent storage: granted' : estimate.persisted === false ? 'Persistent storage: not granted' : 'Persistent storage: unknown';
  };
  const render = () => {
    list.replaceChildren();
    if (busy) { status.textContent = 'Updating saved maps…'; return; }
    if (!records.length) { status.textContent = 'No saved maps in this browser yet.'; return; }
    status.textContent = `${records.length} saved map${records.length === 1 ? '' : 's'}.`;
    for (const record of records) {
      const row = document.createElement('div'); row.className = 'saved-map-row'; row.dataset.mapId = record.mapId;
      const details = document.createElement('div'); details.className = 'saved-map-details';
      const name = document.createElement('strong'); name.textContent = record.name;
      const meta = document.createElement('span'); meta.className = 'saved-map-meta';
      meta.textContent = `Last saved ${formatDate(record.savedAt)} · ${record.nodeCount} node${record.nodeCount === 1 ? '' : 's'} · ${formatBytes(record.attachmentBytes)} attachments`;
      details.append(name, meta);
      const openButton = document.createElement('button'); openButton.type = 'button'; openButton.textContent = 'Open';
      openButton.addEventListener('click', () => { if (!busy) { close({ restoreFocus: false, notify: false }); onOpen?.(record.mapId); } });
      const deleteButton = document.createElement('button'); deleteButton.type = 'button'; deleteButton.textContent = 'Delete saved map';
      deleteButton.addEventListener('click', () => {
        if (busy) return;
        pendingDelete = record; confirmText.textContent = `Delete saved map “${record.name}” from this browser? This does not delete the open graph.`;
        confirm.hidden = false; confirmDelete.focus();
      });
      row.append(details, openButton, deleteButton);
      list.appendChild(row);
    }
  };
  const show = () => {
    if (open) return;
    open = true; lastFocus = document.activeElement || null; overlay.hidden = false; confirm.hidden = true; pendingDelete = null;
    records = []; busy = false; status.textContent = 'Loading saved maps…'; list.replaceChildren();
    onKey = (event) => {
      if (!open) return;
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(dialog.querySelectorAll?.('button') || [])].filter((button) => !button.hidden && !button.disabled);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index < 0 || index === items.length - 1 ? 0 : index + 1);
      items[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    closeButton.focus();
  };
  const setUsage = (next) => { usageState = next; renderUsage(); };
  const setBlocked = (message) => { busy = false; closeButton.disabled = false; status.textContent = String(message || 'Storage is blocked by another FileOrbit tab.'); status.dataset.kind = 'error'; };
  const setPersistResult = (result) => { persistStatus.textContent = result?.status === 'granted' ? 'Persistent storage granted.' : result?.status === 'not-granted' ? 'Persistent storage was not granted.' : result?.status === 'unavailable' ? 'Persistent storage is unavailable in this browser.' : 'Persistent storage request failed.'; };
  const setRecords = (next) => { records = Array.isArray(next) ? next.slice() : []; busy = false; closeButton.disabled = false; persistButton.disabled = false; confirmDelete.disabled = false; confirmCancel.disabled = false; confirm.hidden = true; pendingDelete = null; render(); };
  const setError = (message) => { busy = false; closeButton.disabled = false; persistButton.disabled = false; confirmDelete.disabled = false; confirmCancel.disabled = false; status.textContent = String(message || 'Saved maps could not be loaded.'); status.dataset.kind = 'error'; };
  closeButton.addEventListener('click', () => { if (!busy) close(); });
  persistButton.addEventListener('click', async () => {
    if (busy || !onPersist) return;
    busy = true; persistButton.disabled = true; persistStatus.textContent = 'Requesting persistent storage…';
    try { const result = await onPersist(); setPersistResult(result); }
    catch { persistStatus.textContent = 'Persistent storage request failed.'; }
    finally { busy = false; persistButton.disabled = false; render(); }
  });
  confirmCancel.addEventListener('click', () => { if (!busy) { pendingDelete = null; confirm.hidden = true; } });
  confirmDelete.addEventListener('click', () => {
    if (busy || !pendingDelete) return;
    const record = pendingDelete; pendingDelete = null; confirm.hidden = true; setBusy(true);
    Promise.resolve(onDelete?.(record)).catch((error) => { setBusy(false); setError(String(error?.message || error)); });
  });
  return {
    show, close, setRecords, setUsage, setBlocked, setPersistResult, setError, setBusy,
    get isOpen() { return open; },
    get element() { return overlay; },
    destroy() { close({ restoreFocus: false, notify: false }); overlay.remove(); }
  };
}









