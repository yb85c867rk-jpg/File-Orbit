/**
 * Owned node-editor context menu. It stores only the semantic target; opening
 * the menu never opens the form or changes selection.
 */
export function createEditorContextMenu({
  document,
  host = document?.body,
  viewport = () => ({ width: 0, height: 0 }),
  onAction = null,
  onRename = () => {},
  getDataExportState = () => ({ enabled: false, title: 'No attached file content to save.' })
}) {
  if (!document || !host) throw new Error('document and host are required');
  const menu = document.createElement('div');
  menu.id = 'editor-context-menu';
  menu.className = 'editor-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Node actions');
  menu.hidden = true;

  const submenu = document.createElement('div');
  submenu.id = 'editor-context-submenu';
  submenu.className = 'editor-context-submenu';
  submenu.setAttribute('role', 'menu');
  submenu.setAttribute('aria-label', 'Add');
  submenu.hidden = true;

  const buttons = new Map();
  const separator = () => { const el = document.createElement('div'); el.className = 'editor-menu-separator'; el.setAttribute('role', 'separator'); return el; };
  const item = (action, text, { danger = false } = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-action', action);
    button.setAttribute('role', 'menuitem');
    button.textContent = text;
    if (danger) button.className = 'editor-menu-danger';
    buttons.set(action, button);
    return button;
  };

  const openFolder = item('open-folder', 'Open Folder');
  const openData = item('open-data', 'Open');
  const editFolder = item('edit-folder', 'Edit Folder…');
  const editData = item('edit-data', 'Edit Data…');
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.id = 'editor-context-add';
  addButton.setAttribute('data-action', 'add');
  addButton.setAttribute('role', 'menuitem');
  addButton.setAttribute('aria-haspopup', 'menu');
  addButton.setAttribute('aria-expanded', 'false');
  addButton.setAttribute('aria-controls', 'editor-context-submenu');
  addButton.className = 'editor-context-add';
  const addLabel = document.createElement('span'); addLabel.textContent = 'Add';
  const addArrow = document.createElement('span'); addArrow.className = 'editor-menu-arrow'; addArrow.setAttribute('aria-hidden', 'true'); addArrow.textContent = '▸';
  addButton.appendChild(addLabel);
  if (typeof addButton.appendChild === 'function') addButton.appendChild(addArrow);

  const addFolder = item('add-folder', 'Folder…');
  const addData = item('add-data', 'Data…');
  const uploadFiles = item('upload-files', 'Upload Files…');
  const uploadFolder = item('upload-folder', 'Upload Folder…');
  const exportFolder = item('export-folder', 'Export Folder…');
  const saveData = item('save-data-as', 'Save Data As…');
  const deleteFolder = item('delete-folder', 'Delete Folder…', { danger: true });
  const deleteData = item('delete-data', 'Delete Data…', { danger: true });

  const folderSeparator = separator();
  const fileSeparator = separator();
  for (const child of [openFolder, editFolder, addButton, exportFolder, folderSeparator, deleteFolder, openData, editData, saveData, fileSeparator, deleteData]) menu.appendChild(child);
  for (const child of [addFolder, addData, separator(), uploadFiles, uploadFolder]) submenu.appendChild(child);

  const deleteNote = document.createElement('p');
  deleteNote.className = 'editor-menu-note';
  deleteNote.hidden = true;
  menu.appendChild(deleteNote);

  host.appendChild(menu);
  host.appendChild(submenu);

  let target = null;
  let trigger = null;
  let abort = null;
  let submenuAbort = null;
  let submenuOpen = false;
  let hoverCloseTimer = null;
  let suppressClick = false;
  let suppressTimer = null;

  function actionsFor(hitKind) {
    return hitKind === 'file'
      ? ['open-data', 'edit-data', 'save-data-as', 'delete-data']
      : ['open-folder', 'edit-folder', 'add', 'export-folder', 'delete-folder'];
  }
  function submenuActions() { return ['add-folder', 'add-data', 'upload-files', 'upload-folder']; }
  function enabledMainItems() {
    return [...menu.querySelectorAll('button[role="menuitem"]')].filter((button) => !button.hidden && !button.disabled);
  }
  function enabledSubmenuItems() {
    return submenuActions().map((action) => buttons.get(action)).filter((button) => button && !button.hidden && !button.disabled);
  }
  function renderActions(targetValue) {
    const folder = targetValue.hitKind !== 'file';
    openFolder.hidden = !folder; openData.hidden = folder;
    editFolder.hidden = !folder; editData.hidden = folder;
    saveData.hidden = folder;
    addButton.hidden = !folder;
    exportFolder.hidden = !folder;
    folderSeparator.hidden = !folder; fileSeparator.hidden = folder;
    deleteFolder.hidden = !folder; deleteData.hidden = folder;
    for (const action of submenuActions()) buttons.get(action).hidden = !folder;
    submenu.hidden = true; submenuOpen = false;
    addButton.setAttribute('aria-expanded', 'false');
    const rootProtected = folder && Boolean(targetValue.isRoot);
    deleteFolder.disabled = rootProtected;
    deleteFolder.setAttribute('aria-disabled', String(rootProtected));
    deleteFolder.setAttribute('title', rootProtected ? 'The structural root cannot be deleted.' : 'Delete Folder');
    saveData.disabled = folder;
    saveData.setAttribute('aria-disabled', String(folder));
    saveData.setAttribute('title', folder ? '' : 'Save Data As…');
    if (!folder) { const state = getDataExportState(targetValue) || {}; saveData.disabled = state.enabled === false; saveData.setAttribute('aria-disabled', String(saveData.disabled)); saveData.setAttribute('title', saveData.disabled ? String(state.title || 'No attached file content to save.') : 'Save Data As…'); }
    deleteData.disabled = false;
    deleteData.setAttribute('aria-disabled', 'false');
    deleteData.setAttribute('title', 'Delete Data');
    deleteNote.hidden = true;
    deleteNote.textContent = '';
  }

  function clearListeners() {
    if (abort) { abort.abort(); abort = null; }
    if (submenuAbort) { submenuAbort.abort(); submenuAbort = null; }
    if (hoverCloseTimer !== null) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
    if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; }
  }
  function close({ restoreFocus = true } = {}) {
    const hadMenu = Boolean(abort);
    closeSubmenu({ restoreFocus: false });
    if (!hadMenu) { menu.hidden = true; submenu.hidden = true; return; }
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
    menu.style.left = '0px'; menu.style.top = '0px';
    const rect = typeof menu.getBoundingClientRect === 'function' ? menu.getBoundingClientRect() : { width: 0, height: 0 };
    const width = Number.isFinite(rect.width) ? rect.width : 0;
    const height = Number.isFinite(rect.height) ? rect.height : 0;
    const left = Math.max(8, Math.min(x, Math.max(8, size.width - width - 8)));
    const top = Math.max(8, Math.min(y, Math.max(8, size.height - height - 8)));
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
  }
  function positionSubmenu() {
    if (!submenuOpen || !addButton) return;
    const size = viewport();
    submenu.style.left = '0px'; submenu.style.top = '0px';
    const addRect = typeof addButton.getBoundingClientRect === 'function' ? addButton.getBoundingClientRect() : { right: 0, left: 0, top: 0, bottom: 0 };
    const rect = typeof submenu.getBoundingClientRect === 'function' ? submenu.getBoundingClientRect() : { width: 0, height: 0 };
    const width = Number.isFinite(rect.width) ? rect.width : 0;
    const height = Number.isFinite(rect.height) ? rect.height : 0;
    let left = Number(addRect.right) + 2;
    if (left + width > size.width - 8) left = Number(addRect.left) - width - 2;
    left = Math.max(8, Math.min(left, Math.max(8, size.width - width - 8)));
    let top = Number(addRect.top) || 0;
    if (top + height > size.height - 8) top = Math.max(8, Number(addRect.bottom) - height);
    top = Math.max(8, Math.min(top, Math.max(8, size.height - height - 8)));
    submenu.style.left = `${left}px`; submenu.style.top = `${top}px`;
  }
  function openSubmenu({ focus = false } = {}) {
    if (!target || target.hitKind === 'file') return false;
    if (hoverCloseTimer !== null) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
    submenu.hidden = false; submenuOpen = true;
    addButton.setAttribute('aria-expanded', 'true');
    positionSubmenu();
    if (!submenuAbort) {
      submenuAbort = new AbortController();
      const signal = submenuAbort.signal;
      submenu.addEventListener('pointerenter', () => { if (hoverCloseTimer !== null) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; } }, { signal });
      submenu.addEventListener('pointerleave', () => scheduleHoverClose(), { signal });
      submenu.addEventListener('keydown', onSubmenuKeyDown, { signal });
    }
    if (focus) enabledSubmenuItems()[0]?.focus?.();
    return true;
  }
  function closeSubmenu({ restoreFocus = true, focusAdd = false } = {}) {
    if (!submenuOpen && submenu.hidden) return false;
    submenuOpen = false; submenu.hidden = true;
    addButton.setAttribute('aria-expanded', 'false');
    if (submenuAbort) { submenuAbort.abort(); submenuAbort = null; }
    if (focusAdd || restoreFocus) addButton.focus?.();
    return true;
  }
  function scheduleHoverClose() {
    if (!submenuOpen) return;
    if (hoverCloseTimer !== null) clearTimeout(hoverCloseTimer);
    hoverCloseTimer = setTimeout(() => {
      hoverCloseTimer = null;
      if (submenuOpen && !submenu.contains(document.activeElement) && !addButton.contains(document.activeElement)) closeSubmenu({ restoreFocus: false });
    }, 160);
  }
  function activate(action) {
    if (!target || buttons.get(action)?.disabled) return;
    const chosen = target;
    close({ restoreFocus: false });
    if (onAction) onAction(chosen, action);
    else if (action === 'edit-folder' || action === 'edit-data') onRename(chosen);
  }
  function onMainKeyDown(event) {
    if (!abort) return;
    const items = enabledMainItems();
    const current = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = current < 0 ? (direction > 0 ? 0 : items.length - 1) : (current + direction + items.length) % items.length;
      items[next].focus();
      return;
    }
    if (document.activeElement !== addButton) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const action = document.activeElement?.getAttribute?.('data-action'); if (action && action !== 'add') activate(action); }
      return;
    }
    if (event.key === 'ArrowRight') { event.preventDefault(); openSubmenu({ focus: true }); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSubmenu({ focus: true }); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); closeSubmenu({ restoreFocus: false }); addButton.focus(); }
  }
  function onSubmenuKeyDown(event) {
    const items = enabledSubmenuItems();
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = current < 0 ? (direction > 0 ? 0 : items.length - 1) : (current + direction + items.length) % items.length;
      items[next].focus();
      return;
    }
    if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); closeSubmenu({ restoreFocus: false }); addButton.focus(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSubmenu({ restoreFocus: false }); addButton.focus(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const action = document.activeElement?.getAttribute?.('data-action');
      if (action && submenuActions().includes(action)) activate(action);
    }
  }

  function open({ target: nextTarget, x, y }) {
    if (!nextTarget || typeof nextTarget.id !== 'string') return false;
    close({ restoreFocus: false });
    suppressClick = false;
    if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; }
    target = nextTarget;
    trigger = document.activeElement || null;
    renderActions(nextTarget);
    menu.hidden = false;
    position(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0);
    abort = new AbortController();
    const signal = abort.signal;
    document.addEventListener('pointerdown', (event) => {
      if (menu.contains?.(event.target) || submenu.contains?.(event.target)) {
        if (suppressClick) { suppressClick = false; if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; } }
        return;
      }
      event.preventDefault(); event.stopPropagation();
      suppressNextClick();
      close({ restoreFocus: true });
    }, { capture: true, signal });
    document.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; }
      event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true, signal });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation?.();
      if (submenuOpen) closeSubmenu({ restoreFocus: false, focusAdd: true });
      else close({ restoreFocus: true });
    }, { capture: true, signal });
    menu.addEventListener('keydown', onMainKeyDown, { signal });
    menu.addEventListener('pointerover', (event) => {
      const button = event.target?.closest?.('button[role="menuitem"]');
      if (button && button !== addButton) closeSubmenu({ restoreFocus: false });
    }, { signal });
    addButton.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      if (!submenuOpen) openSubmenu({ focus: false });
      else addButton.focus();
    }, { signal });
    addButton.addEventListener('pointerenter', () => { if (!submenuOpen) openSubmenu({ focus: false }); }, { signal });
    addButton.addEventListener('pointerleave', () => scheduleHoverClose(), { signal });
    const first = actionsFor(nextTarget.hitKind).map((action) => buttons.get(action)).find((button) => button && !button.hidden && !button.disabled);
    (first || openFolder || openData).focus();
    return true;
  }

  for (const [action, button] of buttons) {
    button.addEventListener('click', (event) => {
      if (action === 'delete-folder' || action === 'delete-data') event.stopPropagation();
      activate(action);
    });
  }

  return {
    get isOpen() { return Boolean(abort); },
    get target() { return target; },
    get submenuOpen() { return submenuOpen; },
    get submenu() { return submenu; },
    get addButton() { return addButton; },
    open,
    close,
    destroy() {
      clearListeners();
      target = null;
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      if (submenu.parentNode) submenu.parentNode.removeChild(submenu);
    },
    get element() { return menu; },
    get item() { return openFolder; },
    get actions() { return buttons; }
  };
}
