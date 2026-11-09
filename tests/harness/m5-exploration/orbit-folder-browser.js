/**
 * Application Orbit Folder browser.
 *
 * The native directory picker grants an authorized directory handle. This
 * dialog only lists subfolders and .orbit files; browsing never connects a
 * folder or replaces the current map. Connect and Open are explicit actions.
 */
export function createOrbitFolderBrowserDialog({
  document, host, supported = true,
  onChooseFolder, onRefresh, onNavigate, onBreadcrumb, onUp,
  onConnect, onOpenEntry, onOpenFileElsewhere, onClose
} = {}) {
  if (!document || !host) throw new TypeError('Orbit folder browser requires a document and host.');
  const overlay = document.createElement('div');
  overlay.className = 'file-open-browser-backdrop';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'orbit-folder-browser-title');
  const card = document.createElement('div');
  card.className = 'file-open-browser-card orbit-folder-browser-card';
  const title = document.createElement('h2');
  title.id = 'orbit-folder-browser-title';
  title.textContent = 'Open Map Folder';
  const folderName = document.createElement('p');
  folderName.className = 'orbit-folder-browser-current';
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'orbit-folder-browser-breadcrumb';
  breadcrumb.setAttribute('aria-label', 'Folder path');
  const upButton = document.createElement('button');
  upButton.type = 'button'; upButton.dataset.openBrowser = 'up'; upButton.textContent = 'Parent';
  const toolbar = document.createElement('div');
  toolbar.className = 'file-open-browser-folder-actions orbit-folder-browser-toolbar';
  const chooseButton = document.createElement('button');
  chooseButton.type = 'button'; chooseButton.dataset.openBrowser = 'choose-folder'; chooseButton.textContent = 'Choose Folder';
  const refreshButton = document.createElement('button');
  refreshButton.type = 'button'; refreshButton.dataset.openBrowser = 'refresh'; refreshButton.textContent = 'Refresh';
  toolbar.append(upButton, chooseButton, refreshButton);
  const status = document.createElement('p');
  status.className = 'file-open-browser-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const empty = document.createElement('p');
  empty.className = 'file-open-browser-empty'; empty.hidden = true;
  const listWrap = document.createElement('div');
  listWrap.className = 'file-open-browser-list-wrap';
  const list = document.createElement('ul');
  list.className = 'file-open-browser-list orbit-folder-browser-list';
  list.setAttribute('aria-label', 'Subfolders and Orbit files');
  listWrap.appendChild(list);
  const selectedInfo = document.createElement('p');
  selectedInfo.className = 'orbit-folder-browser-selection';
  const footer = document.createElement('div');
  footer.className = 'file-open-browser-footer orbit-folder-browser-footer';
  const elsewhere = document.createElement('button');
  elsewhere.type = 'button'; elsewhere.dataset.openBrowser = 'elsewhere'; elsewhere.textContent = 'Open file elsewhere…';
  const connectButton = document.createElement('button');
  connectButton.type = 'button'; connectButton.dataset.openBrowser = 'connect'; connectButton.textContent = 'Connect This Folder';
  const openButton = document.createElement('button');
  openButton.type = 'button'; openButton.dataset.openBrowser = 'open'; openButton.textContent = 'Open';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button'; cancelButton.dataset.openBrowser = 'cancel'; cancelButton.textContent = 'Cancel';
  footer.append(elsewhere, connectButton, openButton, cancelButton);
  card.append(title, folderName, breadcrumb, toolbar, status, empty, listWrap, selectedInfo, footer);
  overlay.appendChild(card);
  host.appendChild(overlay);

  let open = false;
  let busy = false;
  let requestId = 0;
  let ownerSession = null;
  let ownerDataset = null;
  let lastFocus = null;
  let snapshot = null;
  let selectedKey = null;
  let currentKey = null;

  const folders = () => snapshot?.folders || (snapshot?.entries || []).filter((entry) => entry.kind === 'folder');
  const files = () => snapshot?.files || (snapshot?.entries || []).filter((entry) => entry.kind !== 'folder');
  const path = () => snapshot?.path?.length ? snapshot.path : (snapshot?.handle ? [{ index: 0, key: 'root', name: snapshot.name || 'Orbit' }] : []);
  const selectedEntry = () => files().find((entry) => entry.key === selectedKey) || null;
  const controls = () => [...card.querySelectorAll('button')];
  const syncButtons = () => {
    const active = Boolean(snapshot?.handle);
    chooseButton.disabled = busy || !supported;
    refreshButton.disabled = busy || !active;
    upButton.disabled = busy || !active || path().length <= 1;
    connectButton.disabled = busy || !active || snapshot?.canConnect === false;
    openButton.disabled = busy || !selectedEntry();
    elsewhere.disabled = false;
    cancelButton.disabled = false;
    chooseButton.textContent = active ? 'Choose Another Folder' : 'Choose Folder';
    overlay.setAttribute('aria-busy', String(busy));
  };
  const setSelected = (key, { focus = false } = {}) => {
    selectedKey = key;
    for (const button of list.querySelectorAll('[data-entry-kind="file"]')) {
      const selected = button.dataset.entryKey === key;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected && focus) button.focus?.();
    }
    const entry = selectedEntry();
    selectedInfo.textContent = entry ? `Selected document: ${entry.name}` : (snapshot?.handle ? 'Select a .orbit file, then choose Open.' : '');
    openButton.disabled = busy || !entry;
  };
  const renderBreadcrumb = () => {
    breadcrumb.replaceChildren();
    const parts = path();
    if (!parts.length) return;
    parts.forEach((part, index) => {
      if (index > 0) {
        const separator = document.createElement('span'); separator.className = 'orbit-folder-browser-separator'; separator.textContent = '›'; separator.setAttribute('aria-hidden', 'true');
        breadcrumb.appendChild(separator);
      }
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.breadcrumbIndex = String(index);
      button.textContent = part.name || 'Orbit';
      if (index === parts.length - 1) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => { if (!open || busy || index === parts.length - 1) return; onBreadcrumb?.(index); });
      breadcrumb.appendChild(button);
    });
  };
  const renderRows = () => {
    const focused = document.activeElement;
    const focusedKey = focused?.dataset?.entryKey || null;
    const focusedKind = focused?.dataset?.entryKind || null;
    const rowHadFocus = Boolean(focusedKey && focused?.classList?.contains?.('file-open-browser-entry'));
    list.replaceChildren();
    const addRow = (entry, kind) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `file-open-browser-entry orbit-folder-browser-entry ${kind}`;
      button.dataset.entryKey = String(entry.key || '');
      button.dataset.entryKind = kind;
      button.dataset.mapName = String(entry.name || '');
      const name = document.createElement('span'); name.className = 'orbit-folder-browser-entry-name'; name.textContent = String(entry.name || '');
      const badge = document.createElement('span'); badge.className = 'orbit-folder-browser-entry-kind'; badge.textContent = kind === 'folder' ? 'Folder' : 'Orbit file';
      button.append(name, badge);
      button.title = String(entry.name || '');
      if (kind === 'file') {
        button.setAttribute('aria-selected', entry.key === selectedKey ? 'true' : 'false');
        button.addEventListener('click', () => { if (!open || busy) return; setSelected(entry.key); });
        button.addEventListener('dblclick', () => { if (!open || busy) return; openSelected(); });
      } else {
        button.addEventListener('click', () => { if (!open || busy) return; onNavigate?.(entry); });
        button.addEventListener('dblclick', () => { if (!open || busy) return; onNavigate?.(entry); });
      }
      if (entry.key === currentKey) button.setAttribute('aria-current', 'true');
      item.appendChild(button);
      list.appendChild(item);
    };
    for (const folder of folders()) addRow(folder, 'folder');
    for (const file of files()) addRow(file, 'file');
    if (rowHadFocus) {
      const rows = [...list.querySelectorAll('[data-entry-key]')];
      const same = rows.find((row) => row.dataset.entryKey === focusedKey && row.dataset.entryKind === focusedKind);
      (same || rows[0] || chooseButton).focus?.();
    }
  };
  const updateChrome = () => {
    const active = Boolean(snapshot?.handle);
    folderName.textContent = active ? `Current folder: ${snapshot.name || 'Orbit'}` : 'No folder selected';
    renderBreadcrumb();
    syncButtons();
  };
  const showState = () => {
    const active = Boolean(snapshot?.handle);
    const phase = snapshot?.phase;
    const folderCount = folders().length; const fileCount = files().length;
    let message = '';
    if (!active && phase === 'opening') message = 'Opening folder…';
    else if (!active) message = supported ? 'Choose a folder to inspect its subfolders and .orbit files.' : 'Orbit folder access is not available in this browser. Open file elsewhere remains available.';
    else if (phase === 'opening' || phase === 'listing') message = 'Loading folder contents…';
    else if (phase === 'blocked' || snapshot?.error) message = snapshot?.error?.message || 'This folder is unavailable. Restore permission or choose another folder.';
    else if (snapshot?.truncated) message = `Showing the first ${folderCount + fileCount} allowed entries; this folder list is truncated.`;
    else if (folderCount + fileCount === 0) message = 'This folder has no subfolders or .orbit files.';
    else message = `${folderCount} folder${folderCount === 1 ? '' : 's'}, ${fileCount} Orbit file${fileCount === 1 ? '' : 's'}.`;
    status.textContent = message;
    empty.hidden = active && folderCount + fileCount > 0;
    empty.textContent = !active ? (supported ? 'No folder selected.' : 'Orbit folder access is unavailable.') : 'This folder is empty.';
    selectedInfo.textContent = active ? (selectedEntry() ? `Selected document: ${selectedEntry().name}` : 'Select a .orbit file, then choose Open.') : '';
  };
  const update = (next, { currentKey: nextCurrentKey = currentKey, selected: requestedSelected, busy: nextBusy } = {}) => {
    if (!open) return;
    snapshot = next || null;
    currentKey = nextCurrentKey || null;
    if (requestedSelected !== undefined) selectedKey = requestedSelected;
    const available = new Set(files().map((entry) => entry.key));
    if (selectedKey && !available.has(selectedKey)) selectedKey = null;
    if (typeof nextBusy === 'boolean') busy = nextBusy;
    updateChrome(); showState(); renderRows(); syncButtons();
  };
  const show = ({ session = null, dataset = null } = {}) => {
    if (open) return;
    open = true; requestId += 1; ownerSession = session; ownerDataset = dataset;
    lastFocus = document.activeElement; overlay.hidden = false; selectedKey = null;
    update(snapshot, { selected: null });
    (supported ? chooseButton : openButton).focus?.();
  };
  const close = ({ restoreFocus = true } = {}) => {
    if (!open) return;
    open = false; busy = false; requestId += 1; overlay.hidden = true; status.textContent = '';
    if (restoreFocus && lastFocus?.isConnected !== false) lastFocus?.focus?.();
  };
  const openSelected = () => {
    const entry = selectedEntry();
    if (!entry || busy) return;
    close({ restoreFocus: false });
    onOpenEntry?.(entry);
  };
  chooseButton.addEventListener('click', () => { if (!open || busy || !supported) return; busy = true; syncButtons(); status.textContent = 'Opening folder…'; onChooseFolder?.(); });
  refreshButton.addEventListener('click', () => { if (!open || busy || !snapshot?.handle) return; busy = true; syncButtons(); status.textContent = 'Loading folder contents…'; onRefresh?.(); });
  upButton.addEventListener('click', () => { if (!open || busy || path().length <= 1) return; onUp?.(); });
  connectButton.addEventListener('click', () => { if (!open || busy || !snapshot?.handle) return; onConnect?.(); });
  openButton.addEventListener('click', openSelected);
  elsewhere.addEventListener('click', () => { if (!open) return; close({ restoreFocus: false }); onOpenFileElsewhere?.(); });
  cancelButton.addEventListener('click', () => { if (!open) return; close(); onClose?.(); });
  overlay.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault?.(); close(); onClose?.(); return; }
    if (event.key !== 'Tab') return;
    const enabled = controls().filter((control) => !control.disabled && !control.hidden && control.isConnected !== false);
    if (!enabled.length) return;
    const first = enabled[0]; const last = enabled[enabled.length - 1]; const index = enabled.indexOf(document.activeElement);
    const next = event.shiftKey ? (index <= 0 ? last : enabled[index - 1]) : (index < 0 || index === enabled.length - 1 ? first : enabled[index + 1]);
    event.preventDefault?.(); next.focus?.();
  });
  return {
    show, close, update,
    setBusy(value, message = '') { busy = Boolean(value); if (message) status.textContent = message; syncButtons(); },
    get isOpen() { return open; },
    get isBusy() { return busy; },
    get requestId() { return requestId; },
    get selectedKey() { return selectedKey; },
    owns(session, dataset) { return open && ownerSession === session && ownerDataset === dataset; },
    get element() { return overlay; },
    destroy() { close({ restoreFocus: false }); overlay.remove?.(); }
  };
}





