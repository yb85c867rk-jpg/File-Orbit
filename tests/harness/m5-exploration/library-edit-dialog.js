export function createLibraryEditDialog({ document, host, onChoose, onApply, onCancel } = {}) {
  if (!document || !host) throw new Error('library edit dialog requires document and host');
  const backdrop = document.createElement('div');
  backdrop.className = 'embed-dialog-backdrop library-edit-backdrop';
  backdrop.hidden = true;
  host.append(backdrop);
  const dialog = document.createElement('section');
  dialog.className = 'embed-dialog library-edit-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'library-edit-title');
  dialog.setAttribute('aria-describedby', 'library-edit-copy');
  const head = document.createElement('div');
  head.className = 'embed-dialog-head';
  const title = document.createElement('h2');
  title.id = 'library-edit-title';
  title.textContent = 'Change linked folder';
  head.append(title);
  const copy = document.createElement('div');
  copy.className = 'embed-dialog-copy';
  const explanation = document.createElement('p');
  explanation.id = 'library-edit-copy';
  explanation.textContent = 'Choose a different folder for this Map Library connection.';
  const note = document.createElement('p');
  note.textContent = 'This changes the linked folder only. It does not move, rename, or delete files, and it does not change where the currently open map is saved.';
  const currentRow = document.createElement('p');
  const currentLabel = document.createElement('strong'); currentLabel.textContent = 'Current folder: ';
  const currentName = document.createElement('span'); currentName.id = 'library-edit-current';
  currentRow.append(currentLabel, currentName);
  const replacementRow = document.createElement('p');
  const replacementLabel = document.createElement('strong'); replacementLabel.textContent = 'Replacement folder: ';
  const replacementName = document.createElement('span'); replacementName.id = 'library-edit-replacement';
  replacementRow.append(replacementLabel, replacementName);
  const choose = document.createElement('button');
  choose.type = 'button'; choose.textContent = 'Choose Folder';
  const status = document.createElement('p');
  status.id = 'library-edit-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div');
  actions.className = 'embed-dialog-actions permission-dialog-actions library-edit-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Apply'; apply.disabled = true;
  actions.append(cancel, apply);
  copy.append(explanation, note, currentRow, replacementRow, choose, status, actions);
  dialog.append(head, copy);
  backdrop.append(dialog);

  let open = false;
  let busy = false;
  let draft = null;
  let lastFocus = null;

  const setStatus = (message, kind = 'info') => { status.textContent = message || ''; status.dataset.kind = kind; };
  const sync = () => {
    choose.disabled = !open || busy;
    cancel.disabled = !open || busy;
    apply.disabled = !open || busy || !draft;
    dialog.setAttribute('aria-busy', String(busy));
  };
  const close = ({ restoreFocus = true, notify = true } = {}) => {
    if (!open) return;
    if (busy) return;
    open = false; draft = null; busy = false;
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (notify) onCancel?.();
    if (restoreFocus) {
      try { lastFocus?.focus?.(); } catch {}
    }
    lastFocus = null;
    sync();
  };
  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!busy) close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [choose, cancel, apply].filter((el) => !el.disabled);
    if (!focusables.length) return;
    const current = document.activeElement;
    const direction = event.shiftKey ? -1 : 1;
    let index = focusables.indexOf(current);
    if (index < 0) index = direction > 0 ? -1 : 0;
    event.preventDefault();
    focusables[(index + direction + focusables.length) % focusables.length].focus();
  };

  choose.addEventListener('click', async () => {
    if (!open || busy || typeof onChoose !== 'function') return;
    busy = true; sync(); setStatus('Opening folder picker…');
    try {
      const picked = await onChoose();
      if (!open) return;
      if (picked?.ok) {
        draft = { handle: picked.handle, name: String(picked.name || picked.handle?.name || '') };
        replacementName.textContent = draft.name || 'Selected folder';
        setStatus('Replacement selected. Choose Apply to validate and commit it.', 'ok');
      } else if (picked?.reason !== 'cancelled' && picked?.reason !== 'stale') {
        setStatus(String(picked?.message || 'The folder could not be selected.'), 'error');
      } else if (picked?.reason === 'cancelled') {
        setStatus('No folder was chosen. The Library connection was not changed. Choose Folder to try again.');
      }
    } catch (error) {
      if (open) setStatus(String(error?.message || error), 'error');
    } finally {
      if (open) { busy = false; sync(); }
    }
  });

  apply.addEventListener('click', async () => {
    if (!open || busy || !draft || typeof onApply !== 'function') return;
    busy = true; sync(); setStatus('Validating replacement folder…');
    let result;
    try {
      result = await onApply({ ...draft, handle: draft.handle, name: draft.name });
    } catch (error) {
      result = { ok: false, message: String(error?.message || error) };
    }
    if (!open) return;
    if (result?.ok) {
      busy = false;
      close({ notify: false, restoreFocus: true });
      return;
    }
    busy = false;
    sync();
    if (result?.reason === 'storage-write-failed') setStatus('The replacement could not be saved. The original Library connection is unchanged. You can retry.', 'error');
    else setStatus(String(result?.message || 'The linked folder could not be changed.'), 'error');
  });

  cancel.addEventListener('click', () => { if (!busy) close(); });
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop && !busy) close(); });

  function show(record) {
    if (open) return false;
    open = true; busy = false; draft = null;
    currentName.textContent = String(record?.name || '');
    replacementName.textContent = 'No replacement selected';
    setStatus('');
    backdrop.hidden = false;
    lastFocus = document.activeElement || null;
    document.addEventListener('keydown', onKey, true);
    sync();
    choose.focus();
    return true;
  }

  return {
    show,
    close,
    get open() { return open; },
    get draft() { return draft; },
    get busy() { return busy; },
    element: backdrop,
    destroy() { close({ restoreFocus: false, notify: false }); backdrop.remove(); }
  };
}
