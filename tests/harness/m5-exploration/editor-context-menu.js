/**
 * Owned node-editor context menu. It stores only the semantic target; opening
 * the menu never opens the form or changes selection.
 */
export function createEditorContextMenu({
  document,
  host = document?.body,
  viewport = () => ({ width: 0, height: 0 }),
  onAction = null,
  onRename = () => {}
}) {
  if (!document || !host) throw new Error('document and host are required');
  const menu = document.createElement('div');
  menu.id = 'editor-context-menu';
  menu.className = 'editor-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Node actions');
  menu.hidden = true;
  const actionDefs = [
    ['edit-folder', 'Edit Folder'],
    ['edit-data', 'Edit Data'],
    ['add-folder', 'Add Folder'],
    ['add-data', 'Add Data'],
    ['upload-files', 'Local Files'],
    ['upload-folder', 'Local Folder'],
    ['delete-folder', 'Delete Folder'],
    ['delete-data', 'Delete Data']
  ];
  const buttons = new Map();
  const uploadHeading = document.createElement('div');
  uploadHeading.className = 'editor-menu-section'; uploadHeading.textContent = 'Upload';
  for (const [action, text] of actionDefs) {
    if (action === 'upload-files') menu.appendChild(uploadHeading);
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-action', action);
    button.setAttribute('role', 'menuitem');
    button.textContent = text;
    menu.appendChild(button);
    buttons.set(action, button);
  }
  const deleteNote = document.createElement('p');
  deleteNote.className = 'editor-menu-note';
  deleteNote.textContent = 'Delete is unavailable until Undo/Redo is implemented.';
  deleteNote.hidden = true;
  menu.appendChild(deleteNote);
  const item = buttons.get('edit-folder');
  host.appendChild(menu);

  let target = null;
  let trigger = null;
  let abort = null;
  let suppressClick = false;
  let suppressTimer = null;

  function actionsFor(hitKind) {
    return hitKind === 'file'
      ? ['edit-data', 'delete-data']
      : ['edit-folder', 'add-folder', 'add-data', 'upload-files', 'upload-folder', 'delete-folder'];
  }
  function renderActions(targetValue) {
    const allowed = new Set(actionsFor(targetValue.hitKind));
    for (const [action, button] of buttons) button.hidden = !allowed.has(action);
    uploadHeading.hidden = targetValue.hitKind !== 'folder';
    const rootProtected = targetValue.hitKind === 'folder' && Boolean(targetValue.isRoot);
    const deleteFolder = buttons.get('delete-folder');
    deleteFolder.disabled = rootProtected;
    deleteFolder.setAttribute('aria-disabled', String(rootProtected));
    deleteFolder.setAttribute('title', rootProtected ? 'The structural root cannot be deleted.' : 'Delete Folder');
    const deleteData = buttons.get('delete-data');
    deleteData.disabled = false;
    deleteData.setAttribute('aria-disabled', 'false');
    deleteData.setAttribute('title', 'Delete Data');
    deleteNote.hidden = true;
    deleteNote.textContent = '';
  }

  function clearListeners() {
    if (abort) { abort.abort(); abort = null; }
    if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; }
  }
  function close({ restoreFocus = true } = {}) {
    if (!abort) { menu.hidden = true; return; }
    clearListeners();
    menu.hidden = true;
    target = null;
    if (restoreFocus && trigger && typeof trigger.focus === 'function') trigger.focus();
    trigger = null;
  }
  function suppressNextClick() {
    suppressClick = true;
    if (suppressTimer !== null) clearTimeout(suppressTimer);
    suppressTimer = setTimeout(() => { suppressClick = false; suppressTimer = null; }, 0);
  }
  function position(x, y) {
    const size = viewport();
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = typeof menu.getBoundingClientRect === 'function'
      ? menu.getBoundingClientRect()
      : { width: 0, height: 0 };
    const width = Number.isFinite(rect.width) ? rect.width : 0;
    const height = Number.isFinite(rect.height) ? rect.height : 0;
    const left = Math.max(8, Math.min(x, Math.max(8, size.width - width - 8)));
    const top = Math.max(8, Math.min(y, Math.max(8, size.height - height - 8)));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  function open({ target: nextTarget, x, y }) {
    if (!nextTarget || typeof nextTarget.id !== 'string') return false;
    close({ restoreFocus: false });
    target = nextTarget;
    trigger = document.activeElement || null;
    renderActions(nextTarget);
    menu.hidden = false;
    position(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0);
    abort = new AbortController();
    const signal = abort.signal;
    document.addEventListener('pointerdown', (event) => {
      if (menu.contains?.(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick();
      close({ restoreFocus: true });
    }, { capture: true, signal });
    document.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; }
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, signal });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close({ restoreFocus: true });
    }, { capture: true, signal });
    (actionsFor(nextTarget.hitKind).map((action) => buttons.get(action))[0] || item).focus();
    return true;
  }

  for (const [action, button] of buttons) {
    button.addEventListener('click', () => {
      if (!target || button.disabled) return;
      const chosen = target;
      close({ restoreFocus: false });
      if (onAction) onAction(chosen, action);
      else if (action === 'edit-folder' || action === 'edit-data') onRename(chosen);
    });
  }

  return {
    get isOpen() { return Boolean(abort); },
    get target() { return target; },
    open,
    close,
    destroy() {
      clearListeners();
      target = null;
      if (menu.parentNode) menu.parentNode.removeChild(menu);
    },
    get element() { return menu; },
    get item() { return item; },
    get actions() { return buttons; }
  };
}







