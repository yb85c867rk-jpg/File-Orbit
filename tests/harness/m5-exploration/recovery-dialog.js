/** Startup recovery selection dialog. Candidate names and metadata are rendered as text only. */
export function createRecoveryDialog({ document, host, onRecover, onDiscard, onLater }) {
  const overlay = document.createElement('div');
  overlay.className = 'recovery-backdrop'; overlay.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'recovery-dialog';
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'recovery-title'); dialog.setAttribute('aria-describedby', 'recovery-body');
  const title = document.createElement('h2'); title.id = 'recovery-title'; title.textContent = 'Recover unsaved work?';
  const body = document.createElement('p'); body.id = 'recovery-body';
  body.textContent = 'FileOrbit found a recovery copy of this map. Recover it to continue editing. Your original file will not be changed.';
  const status = document.createElement('p'); status.className = 'recovery-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const list = document.createElement('div'); list.className = 'recovery-list';
  const warning = document.createElement('p'); warning.className = 'recovery-warning';
  warning.textContent = 'Discard removes this recovery copy from FileOrbit permanently. It does not delete the original .orbit file.';
  const actions = document.createElement('div'); actions.className = 'recovery-actions';
  const recoverButton = document.createElement('button'); recoverButton.type = 'button'; recoverButton.textContent = 'Recover work';
  const discardButton = document.createElement('button'); discardButton.type = 'button'; discardButton.textContent = 'Discard recovery';
  const laterButton = document.createElement('button'); laterButton.type = 'button'; laterButton.textContent = 'Later';
  actions.append(recoverButton, discardButton, laterButton);
  dialog.append(title, body, status, list, warning, actions);
  overlay.appendChild(dialog); host.appendChild(overlay);
  let open = false; let busy = false; let records = []; let selectedId = null; let lastFocus = null; let onKey = null;
  const formatDate = (value) => { try { return new Date(value).toLocaleString(); } catch { return String(value || ''); } };
  function selected() { return records.find((record) => record.workspaceId === selectedId) || records[0] || null; }
  function render() {
    list.replaceChildren();
    if (!records.length) { status.textContent = 'No eligible recovery copies remain.'; recoverButton.disabled = true; discardButton.disabled = true; return; }
    if (!selectedId || !records.some((record) => record.workspaceId === selectedId)) selectedId = records[0].workspaceId;
    for (const record of records) {
      const label = document.createElement('label'); label.className = 'recovery-row';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'recovery-candidate'; radio.value = record.workspaceId;
      radio.checked = record.workspaceId === selectedId; radio.disabled = busy;
      radio.setAttribute('aria-label', 'Select recovery copy ' + record.name);
      radio.addEventListener('change', () => { if (radio.checked) { selectedId = record.workspaceId; status.textContent = ''; render(); } });
      const details = document.createElement('span'); details.className = 'recovery-details';
      const name = document.createElement('strong'); name.textContent = record.name;
      const meta = document.createElement('span'); meta.className = 'recovery-meta';
      meta.textContent = `${formatDate(record.capturedAt)} · ${record.folderCount ?? 0} folder${record.folderCount === 1 ? '' : 's'} · ${record.fileCount ?? 0} file${record.fileCount === 1 ? '' : 's'}`;
      details.append(name, meta); label.append(radio, details); list.appendChild(label);
    }
    recoverButton.disabled = busy || !records.length;
    discardButton.disabled = busy || !records.length;
    laterButton.disabled = busy;
  }
  function close({ restoreFocus = true, notify = false } = {}) {
    if (!open) return;
    open = false; busy = false; overlay.hidden = true;
    if (onKey) document.removeEventListener('keydown', onKey, true);
    onKey = null;
    if (restoreFocus && lastFocus?.focus) lastFocus.focus();
    lastFocus = null;
    if (notify) onLater?.();
  }
  function show(candidates) {
    if (open) { records = candidates.slice(); render(); return; }
    open = true; lastFocus = document.activeElement || null; overlay.hidden = false; busy = false;
    records = Array.isArray(candidates) ? candidates.slice() : []; selectedId = records[0]?.workspaceId || null; status.textContent = '';
    render();
    onKey = (event) => {
      if (!open) return;
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close({ notify: true }); return; }
      if (event.key !== 'Tab') return;
      const items = [...(dialog.querySelectorAll?.('button, input[type="radio"]') || [])].filter((item) => !item.disabled && !item.hidden);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index < 0 || index === items.length - 1 ? 0 : index + 1);
      items[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    laterButton.focus();
  }
  recoverButton.addEventListener('click', () => { if (!busy) { const record = selected(); if (record) onRecover?.(record); } });
  discardButton.addEventListener('click', () => { if (!busy) { const record = selected(); if (record) onDiscard?.(record); } });
  laterButton.addEventListener('click', () => { if (!busy) close({ notify: true }); });
  return {
    show, close,
    setCandidates(next) { records = Array.isArray(next) ? next.slice() : []; busy = false; selectedId = records[0]?.workspaceId || null; render(); },
    setBusy(value) { busy = Boolean(value); if (busy) { recoverButton.disabled = true; discardButton.disabled = true; laterButton.disabled = true; } render(); },
    setStatus(message, kind = '') { status.textContent = String(message || ''); status.dataset.kind = kind; },
    get selected() { return selected(); },
    get isOpen() { return open; },
    destroy() { close({ restoreFocus: false, notify: false }); overlay.remove(); }
  };
}
