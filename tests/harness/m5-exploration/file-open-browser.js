/** Integrated Open File browser: current Orbit folder + its top-level maps. */
export function createFileOpenBrowserDialog({ document, host, supported = true, onChooseFolder, onRefresh, onOpenEntry, onOpenFileElsewhere, onClose } = {}) {
  if (!document || !host) throw new TypeError('Open browser requires a document and host.');
  const overlay = document.createElement('div');
  overlay.className = 'file-open-browser-backdrop';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'file-open-browser-title');
  const card = document.createElement('div');
  card.className = 'file-open-browser-card';
  const title = document.createElement('h2');
  title.id = 'file-open-browser-title';
  title.textContent = 'Open Orbit Folder';
  const folderRow = document.createElement('div');
  folderRow.className = 'file-open-browser-folder';
  const folderName = document.createElement('span');
  folderName.className = 'file-open-browser-folder-name';
  folderName.textContent = 'No Orbit selected';
  const folderActions = document.createElement('div');
  folderActions.className = 'file-open-browser-folder-actions';
  const chooseButton = document.createElement('button');
  chooseButton.type = 'button';
  chooseButton.dataset.openBrowser = 'choose-folder';
  chooseButton.textContent = 'Choose folder';
  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.dataset.openBrowser = 'refresh';
  refreshButton.textContent = 'Refresh';
  const openElsewhere = document.createElement('button');
  openElsewhere.type = 'button';
  openElsewhere.dataset.openBrowser = 'elsewhere';
  openElsewhere.textContent = 'Open file elsewhere…';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.dataset.openBrowser = 'close';
  closeButton.textContent = 'Close';
  folderActions.append(chooseButton, refreshButton);
  folderRow.append(folderName, folderActions);
  const status = document.createElement('p');
  status.className = 'file-open-browser-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const empty = document.createElement('p');
  empty.className = 'file-open-browser-empty';
  empty.hidden = true;
  const listWrap = document.createElement('div');
  listWrap.className = 'file-open-browser-list-wrap';
  const list = document.createElement('ul');
  list.className = 'file-open-browser-list';
  list.setAttribute('aria-label', 'Orbit map files');
  listWrap.appendChild(list);
  const footer = document.createElement('div');
  footer.className = 'file-open-browser-footer';
  footer.append(openElsewhere, closeButton);
  card.append(title, folderRow, status, empty, listWrap, footer);
  overlay.appendChild(card);
  host.appendChild(overlay);

  let open = false;
  let busy = false;
  let requestId = 0;
  let ownerSession = null;
  let ownerDataset = null;
  let lastFocus = null;
  let snapshot = null;
  let currentKey = null;

  // Use actual DOM order: folder actions, map rows, footer actions.
  const allControls = () => [...card.querySelectorAll('button')];
  const setBusy = (value, message = '') => {
    busy = Boolean(value);
    overlay.setAttribute('aria-busy', String(busy));
    if (message) status.textContent = message;
    chooseButton.disabled = busy || !supported;
    refreshButton.disabled = busy || !snapshot?.handle;
    openElsewhere.disabled = false;
    closeButton.disabled = false;
    chooseButton.textContent = snapshot?.handle ? 'Change folder' : 'Choose folder';
  };

  const renderRows = () => {
    const focused = document.activeElement;
    const focusedEntryKey = focused?.dataset?.entryKey || null;
    const rowHadFocus = Boolean(focusedEntryKey && focused?.className === 'file-open-browser-entry');
    list.replaceChildren();
    const entries = snapshot?.entries || [];
    for (const entry of entries) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'file-open-browser-entry';
      button.dataset.mapName = String(entry.name || '');
      button.dataset.entryKey = String(entry.key || '');
      button.textContent = String(entry.name || '');
      button.title = String(entry.name || '');
      if (entry.key === currentKey) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => {
        if (!open || busy) return;
        close({ restoreFocus: false });
        onOpenEntry?.(entry);
      });
      item.appendChild(button);
      list.appendChild(item);
    }
    if (rowHadFocus) {
      const rows = [...list.querySelectorAll('button')];
      const sameRow = rows.find((button) => button.dataset.entryKey === focusedEntryKey);
      const nextFocus = sameRow || rows[0] || (snapshot?.handle ? refreshButton : chooseButton);
      nextFocus?.focus?.();
    }
  };

  const update = (next, { currentKey: nextCurrentKey = currentKey, busy: nextBusy } = {}) => {
    if (!open) return;
    snapshot = next || null;
    currentKey = nextCurrentKey || null;
    if (typeof nextBusy === 'boolean') busy = nextBusy;
    const active = Boolean(snapshot?.handle);
    folderName.textContent = active ? String(snapshot.name || 'Orbit') : 'No Orbit selected';
    chooseButton.textContent = active ? 'Change folder' : 'Choose folder';
    const phase = snapshot?.phase;
    const entries = snapshot?.entries || [];
    let stateText = '';
    if (!active && phase === 'opening') stateText = 'Opening folder…';
    else if (!active) stateText = supported ? 'Choose a folder to browse its top-level .orbit files.' : 'Orbit folder access is not available in this browser. Open file elsewhere remains available.';
    else if (phase === 'opening' || phase === 'listing') stateText = 'Refreshing Orbit…';
    else if (phase === 'blocked' || snapshot?.error) stateText = snapshot?.error?.message || 'This Orbit is unavailable. Restore permission or choose another folder.';
    else if (snapshot?.truncated) stateText = 'The Orbit list is truncated; showing the first ' + entries.length + ' maps.';
    else if (snapshot?.stale) stateText = 'The Orbit list may be out of date. Refresh to update it.';
    else if (!entries.length) stateText = 'This Orbit has no top-level .orbit files.';
    else stateText = entries.length + ' map' + (entries.length === 1 ? '' : 's') + ' in ' + String(snapshot.name || 'this Orbit') + '.';
    status.textContent = stateText;
    empty.hidden = active && entries.length > 0;
    empty.textContent = !active ? (supported ? 'No Orbit folder selected.' : 'Orbit folder access is not available in this browser.') : 'No top-level .orbit files in this Orbit.';
    renderRows();
    setBusy(busy);
  };

  const show = ({ session = null, dataset = null } = {}) => {
    if (open) return;
    open = true;
    requestId += 1;
    ownerSession = session;
    ownerDataset = dataset;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    update(snapshot, { currentKey });
    (supported ? chooseButton : openElsewhere).focus?.();
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (!open) return;
    open = false;
    busy = false;
    requestId += 1;
    overlay.hidden = true;
    status.textContent = '';
    if (restoreFocus && lastFocus?.isConnected !== false) lastFocus?.focus?.();
  };

  chooseButton.addEventListener('click', () => {
    if (!open || busy || !supported) return;
    setBusy(true, 'Opening folder…');
    onChooseFolder?.();
  });
  refreshButton.addEventListener('click', () => {
    if (!open || busy || !snapshot?.handle) return;
    setBusy(true, 'Refreshing Orbit…');
    onRefresh?.();
  });
  openElsewhere.addEventListener('click', () => {
    if (!open) return;
    close({ restoreFocus: false });
    onOpenFileElsewhere?.();
  });
  closeButton.addEventListener('click', () => {
    if (!open) return;
    close();
    onClose?.();
  });
  overlay.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault?.(); close(); onClose?.(); return; }
    if (event.key !== 'Tab') return;
    const controls = allControls().filter((control) => !control.disabled && !control.hidden && control.isConnected !== false);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    const index = controls.indexOf(active);
    const next = event.shiftKey
      ? (index <= 0 ? last : controls[index - 1])
      : (index < 0 || index === controls.length - 1 ? first : controls[index + 1]);
    event.preventDefault?.();
    next.focus?.();
  });

  return {
    show,
    close,
    update,
    setBusy,
    get isOpen() { return open; },
    get isBusy() { return busy; },
    get requestId() { return requestId; },
    owns(session, dataset) { return open && ownerSession === session && ownerDataset === dataset; },
    get element() { return overlay; },
    destroy() { close({ restoreFocus: false }); overlay.remove?.(); }
  };
}
