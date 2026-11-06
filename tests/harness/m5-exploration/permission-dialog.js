export function createPermissionDialog({ document, host } = {}) {
  if (!document || !host) throw new Error('permission dialog requires document and host');
  const backdrop = document.createElement('div');
  host.append(backdrop);
  backdrop.className = 'embed-dialog-backdrop';
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
  title.textContent = 'Permission to save maps';
  head.append(title);
  const copy = document.createElement('div');
  copy.className = 'embed-dialog-copy';
  const body = document.createElement('p');
  body.id = 'permission-dialog-body';
  const browserNote = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'embed-dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const proceed = document.createElement('button');
  proceed.type = 'button';
  proceed.textContent = 'Continue';
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

  function show({ directoryName = 'this folder', fileSpecific = false, fileName = '' } = {}) {
    if (open) return Promise.resolve(false);
    open = true;
    resolvePromise = null;
    lastFocus = document.activeElement;
    const name = String(fileSpecific ? (fileName || directoryName) : directoryName || 'this folder');
    body.textContent = fileSpecific
      ? `To update ‘${name}’, FileOrbit needs permission to write to this file.`
      : `To create or update maps in ‘${name}’, FileOrbit needs permission to write to this folder.`;
    browserNote.textContent = 'On the next browser prompt, choose Allow to grant access. Granting permission does not immediately change any files; FileOrbit will then continue the save you requested. Your browser may ask again in a future session.';
    backdrop.hidden = false;
    cancel.focus();
    return new Promise((resolve) => { resolvePromise = resolve; });
  }

  return {
    show,
    close,
    get open() { return open; },
    element: backdrop,
    destroy() {
      close(false);
      backdrop.remove();
    }
  };
}

