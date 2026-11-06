export function createPermissionDialog({ document, host } = {}) {
  if (!document || !host) throw new Error('permission dialog requires document and host');
  const backdrop = document.createElement('div');
  host.append(backdrop);
  backdrop.className = 'embed-dialog-backdrop permission-dialog-backdrop';
  backdrop.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'embed-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'permission-dialog-title');
  dialog.setAttribute('aria-describedby', 'permission-dialog-body');
  const head = document.createElement('div');
  head.className = 'embed-dialog-head';
  const title = document.createElement('h2');
  title.id = 'permission-dialog-title';
  head.append(title);
  const copy = document.createElement('div');
  copy.className = 'embed-dialog-copy';
  const body = document.createElement('p');
  body.id = 'permission-dialog-body';
  const browserNote = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'embed-dialog-actions permission-dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const proceed = document.createElement('button');
  proceed.type = 'button';
  actions.append(cancel, proceed);
  copy.append(body, browserNote, actions);
  dialog.append(head, copy);
  backdrop.append(dialog);

  let open = false;
  let resolvePromise = null;
  let lastFocus = null;

  function close(value) {
    if (!open) return;
    open = false;
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    const resolve = resolvePromise;
    resolvePromise = null;
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch {}
    }
    lastFocus = null;
    resolve?.(Boolean(value));
  }

  function onKey(event) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [cancel, proceed].filter((el) => !el.disabled);
    if (!focusables.length) return;
    const current = document.activeElement;
    const direction = event.shiftKey ? -1 : 1;
    let index = focusables.indexOf(current);
    if (index < 0) index = direction > 0 ? -1 : 0;
    const next = focusables[(index + direction + focusables.length) % focusables.length];
    event.preventDefault();
    next.focus();
  }

  cancel.addEventListener('click', () => close(false));
  proceed.addEventListener('click', () => close(true));
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) close(false); });

  function show({ mode = 'save', directoryName = 'this folder', fileName = '', fileSpecific = false } = {}) {
    if (open) return Promise.resolve(false);
    open = true;
    resolvePromise = null;
    lastFocus = document.activeElement;
    if (mode === 'library') {
      title.textContent = 'Connect a Map Library folder';
      body.textContent = 'This folder stores and organizes the topic maps you create.';
      browserNote.textContent = 'In the next browser permission prompt, choose Allow so FileOrbit can list and open maps in the selected folder. Saving a map may require additional permission. Connecting a folder does not change or delete any files.';
      proceed.textContent = 'Choose Folder';
    } else {
      const name = String(fileSpecific ? (fileName || directoryName) : directoryName || 'this folder');
      title.textContent = 'Permission to save this map';
      body.textContent = fileSpecific
        ? `To save your changes to ‘${name}’, FileOrbit needs permission to write to this file.`
        : `To save changes in ‘${name}’, FileOrbit needs permission to write to this folder.`;
      browserNote.textContent = 'Choose Continue, then Allow in the browser prompt to continue the save you requested.';
      proceed.textContent = 'Continue';
    }
    backdrop.hidden = false;
    cancel.focus();
    return new Promise((resolve) => { resolvePromise = resolve; });
  }

  return {
    show,
    showLibraryConnection() { return show({ mode: 'library' }); },
    showSavePermission(options = {}) { return show({ ...options, mode: 'save' }); },
    close,
    get open() { return open; },
    element: backdrop,
    destroy() {
      close(false);
      backdrop.remove();
    }
  };
}
