/** Accessible preview and progress dialog for folder export. It owns no data. */
export function createFolderExportDialog({ document, host = document?.body, onChooseDestination = () => {}, onExport = () => {}, onCancel = () => {} } = {}) {
  if (!document || !host) throw new Error('document and host are required');
  const overlay = document.createElement('div');
  overlay.className = 'folder-export-backdrop';
  overlay.hidden = true;
  const dialog = document.createElement('div');
  dialog.className = 'folder-export-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'folder-export-title');
  const title = document.createElement('h2'); title.id = 'folder-export-title'; title.textContent = 'Export Folder';
  const body = document.createElement('div'); body.className = 'folder-export-body';
  const intro = document.createElement('p');
  const counts = document.createElement('dl'); counts.className = 'folder-export-counts';
  const outputRow = document.createElement('label'); outputRow.className = 'folder-export-field';
  const outputText = document.createElement('span'); outputText.textContent = 'Output folder name';
  const outputInput = document.createElement('input'); outputInput.type = 'text'; outputInput.autocomplete = 'off';
  outputRow.append(outputText, outputInput);
  const destination = document.createElement('p'); destination.className = 'folder-export-destination'; destination.hidden = true;
  const errors = document.createElement('div'); errors.className = 'folder-export-errors'; errors.setAttribute('role', 'alert'); errors.hidden = true;
  const progress = document.createElement('p'); progress.className = 'folder-export-progress'; progress.setAttribute('aria-live', 'polite'); progress.hidden = true;
  body.append(intro, counts, outputRow, destination, errors, progress);
  const actions = document.createElement('div'); actions.className = 'folder-export-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = 'Choose Destination'; choose.className = 'folder-export-primary';
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = 'Export'; exportButton.className = 'folder-export-primary'; exportButton.hidden = true;
  actions.append(cancel, choose, exportButton);
  dialog.append(title, body, actions);
  overlay.appendChild(dialog); host.appendChild(overlay);

  let trigger = null;
  let busy = false;
  let destinationName = null;
  let errorsPresent = false;
  let unsupported = false;
  let abort = null;

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
  function sync() {
    outputInput.disabled = busy;
    choose.disabled = busy || unsupported || errorsPresent || Boolean(destinationName);
    exportButton.disabled = busy || !destinationName || errorsPresent;
    cancel.disabled = false;
    dialog.setAttribute('aria-busy', String(busy));
    if (destinationName) { destination.hidden = false; destination.textContent = `Destination: ${destinationName}`; choose.hidden = true; exportButton.hidden = false; }
    else { destination.hidden = true; choose.hidden = false; exportButton.hidden = true; }
  }
  function showErrors(values) {
    const list = Array.isArray(values) ? values : [];
    errorsPresent = list.length > 0;
    errors.replaceChildren();
    if (errorsPresent) {
      const heading = document.createElement('p'); heading.textContent = 'Resolve these items before exporting:'; errors.appendChild(heading);
      const ul = document.createElement('ul');
      for (const value of list) { const li = document.createElement('li'); li.textContent = typeof value === 'string' ? value : String(value?.message || value?.reason || 'This item cannot be exported.'); ul.appendChild(li); }
      errors.appendChild(ul);
    }
    errors.hidden = !errorsPresent;
    sync();
  }
  function close({ restoreFocus = true } = {}) {
    if (abort) { abort.abort(); abort = null; }
    overlay.hidden = true;
    busy = false;
    if (restoreFocus && trigger?.focus) trigger.focus();
    trigger = null;
  }
  function open({ folderName, outputName, totals, planErrors = [], pickerUnsupported = false } = {}) {
    close({ restoreFocus: false });
    trigger = document.activeElement || null;
    title.textContent = 'Export Folder';
    intro.textContent = `Export “${folderName}” as an independent copy. This does not change the .orbit file or synchronize with the source.`;
    counts.replaceChildren();
    const rows = [
      ['Folders', totals?.directories ?? 0], ['Attached files', totals?.attachments ?? 0],
      ['Web-link pages', totals?.webLinks ?? 0], ['Skipped description-only items', totals?.skipped ?? 0],
      ['Total bytes', formatBytes(totals?.totalBytes ?? 0)]
    ];
    for (const [label, value] of rows) { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = String(value); counts.append(dt, dd); }
    outputInput.value = outputName || folderName || 'export';
    destinationName = null;
    unsupported = Boolean(pickerUnsupported);
    progress.hidden = true; progress.textContent = '';
    showErrors(planErrors);
    if (!errorsPresent && unsupported) showErrors(['This browser does not support choosing a destination folder. Folder export is unavailable here.']);
    overlay.hidden = false;
    abort = new AbortController(); const signal = abort.signal;
    outputInput.addEventListener('input', () => { if (errorsPresent) showErrors([]); }, { signal });
    cancel.addEventListener('click', () => { onCancel({ busy }); if (!busy) close({ restoreFocus: true }); }, { signal });
    choose.addEventListener('click', () => { if (!busy) onChooseDestination(); }, { signal });
    exportButton.addEventListener('click', () => { if (!busy) onExport({ outputName: outputInput.value }); }, { signal });
    document.addEventListener('keydown', (event) => {
      if (overlay.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation?.(); if (!busy) { onCancel({ busy: false }); close({ restoreFocus: true }); } return; }
      if (event.key !== 'Tab') return;
      const items = [outputInput, cancel, choose, exportButton].filter((item) => !item.hidden && !item.disabled);
      if (!items.length) return;
      event.preventDefault();
      const first = items[0], last = items[items.length - 1];
      if (!items.includes(document.activeElement)) { (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) last.focus();
      else if (!event.shiftKey && document.activeElement === last) first.focus();
    }, { capture: true, signal });
    (errorsPresent || unsupported ? cancel : choose).focus();
    sync();
    return true;
  }
  function destroy() { close({ restoreFocus: false }); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
  return {
    open, close, destroy,
    get isOpen() { return !overlay.hidden; },
    get busy() { return busy; },
    get destinationName() { return destinationName; },
    get outputName() { return outputInput.value; },
    setDestination(name) { destinationName = String(name || ''); sync(); },
    clearDestination() { destinationName = null; sync(); },
    setErrors(values) { showErrors(values); },
    setBusy(value, message = '') { busy = Boolean(value); progress.hidden = !busy && !message; progress.textContent = message; sync(); },
    setProgress(message) { progress.hidden = false; progress.textContent = String(message || ''); },
    setOutputName(value) { outputInput.value = String(value || ''); },
    focus() { (errorsPresent ? cancel : choose).focus(); },
    get element() { return dialog; }
  };
}
