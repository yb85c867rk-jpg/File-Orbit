/**
 * Isolated external-file conflict dialog. It returns a decision only; it does
 * not write, adopt a destination, change dirty state, or touch recovery.
 */
export function createFileConflictDialog({ document, host, getMapBounds = null } = {}) {
  if (!document || !host) throw new TypeError('File conflict dialog requires document and host.');

  const overlay = document.createElement('div');
  overlay.className = 'file-conflict-backdrop';
  overlay.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'file-conflict-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'file-conflict-title');
  dialog.setAttribute('aria-describedby', 'file-conflict-description file-conflict-file');
  const title = document.createElement('h2');
  title.id = 'file-conflict-title';
  title.textContent = 'This file has a newer saved version';
  const description = document.createElement('p');
  description.id = 'file-conflict-description';
  const fileLine = document.createElement('p');
  fileLine.id = 'file-conflict-file';
  fileLine.className = 'file-conflict-file';
  const actions = document.createElement('div');
  actions.className = 'file-conflict-actions';
  const overwrite = document.createElement('button');
  overwrite.type = 'button'; overwrite.id = 'file-conflict-replace'; overwrite.dataset.conflictAction = 'replace'; overwrite.setAttribute('data-conflict-action', 'replace'); overwrite.textContent = 'Replace Saved File';
  const copy = document.createElement('button');
  copy.type = 'button'; copy.id = 'file-conflict-copy'; copy.dataset.conflictAction = 'copy'; copy.setAttribute('data-conflict-action', 'copy'); copy.textContent = 'Save a Copy';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.id = 'file-conflict-cancel'; cancel.dataset.conflictAction = 'cancel'; cancel.setAttribute('data-conflict-action', 'cancel'); cancel.textContent = 'Cancel';
  actions.append(overwrite, copy, cancel);
  dialog.append(title, description, fileLine, actions);
  overlay.appendChild(dialog);
  host.appendChild(overlay);

  let destroyed = false;
  let active = null;
  let lastFocus = null;
  let onKey = null;
  let onFocusIn = null;
  let onResize = null;
  let observer = null;
  let sequence = 0;

  const safeFilename = (value) => {
    const name = String(value || '').split(/[\\/]/).pop().trim();
    return name || 'the selected file';
  };

  const viewportSize = () => ({
    width: Math.max(0, Number(document.defaultView?.innerWidth) || Number(globalThis.innerWidth) || 0),
    height: Math.max(0, Number(document.defaultView?.innerHeight) || Number(globalThis.innerHeight) || 0)
  });

  const mapBounds = () => {
    let bounds = null;
    try { if (typeof getMapBounds === 'function') bounds = getMapBounds(); } catch {}
    if (!bounds || !(Number(bounds.width) > 0) || !(Number(bounds.height) > 0)) {
      const size = viewportSize();
      bounds = { left: 0, top: 0, width: size.width, height: size.height };
    }
    return {
      left: Number(bounds.left) || 0,
      top: Number(bounds.top) || 0,
      width: Number(bounds.width) || 0,
      height: Number(bounds.height) || 0
    };
  };

  const positionDialog = () => {
    if (!active) return;
    const size = viewportSize();
    if (!(size.width > 0) || !(size.height > 0)) return;
    const map = mapBounds();
    const margin = 16;
    const width = Math.max(0, Math.min(620, map.width - margin * 2, size.width - margin * 2));
    if (!(width > 0)) return;
    dialog.style.width = width + 'px';
    dialog.style.maxHeight = Math.max(0, Math.min(map.height, size.height) - margin * 2) + 'px';
    const centerX = map.left + map.width / 2;
    const centerY = map.top + map.height / 2;
    const minX = margin + width / 2;
    const maxX = size.width - margin - width / 2;
    const halfHeight = Math.min(Math.max(0, dialog.offsetHeight / 2), Math.max(0, size.height / 2 - margin));
    dialog.style.left = Math.min(Math.max(centerX, minX), Math.max(minX, maxX)) + 'px';
    dialog.style.top = Math.min(Math.max(centerY, margin + halfHeight), Math.max(margin + halfHeight, size.height - margin - halfHeight)) + 'px';
  };

  const attachPositioning = () => {
    const view = document.defaultView;
    if (view?.addEventListener) { onResize = positionDialog; view.addEventListener('resize', onResize); }
    if (typeof ResizeObserver === 'function' && typeof document.querySelector === 'function') {
      observer = new ResizeObserver(positionDialog);
      const map = document.querySelector('#graph-viewport');
      if (map) observer.observe(map);
    }
    positionDialog();
  };

  const detachPositioning = () => {
    const view = document.defaultView;
    if (onResize) view?.removeEventListener?.('resize', onResize);
    onResize = null;
    try { observer?.disconnect?.(); } catch {}
    observer = null;
  };

  const removeKey = () => {
    if (onKey) document.removeEventListener?.('keydown', onKey, true);
    if (onFocusIn) document.removeEventListener?.('focusin', onFocusIn, true);
    onKey = null;
    onFocusIn = null;
  };

  const close = ({ restoreFocus = true } = {}) => {
    overlay.hidden = true;
    detachPositioning();
    removeKey();
    if (restoreFocus && lastFocus?.focus) lastFocus.focus();
    lastFocus = null;
  };

  const settle = (request, decision) => {
    if (!request || request.settled) return false;
    request.settled = true;
    if (active === request) active = null;
    close();
    request.resolve(decision);
    return true;
  };

  const isInsideDialog = (target) => Boolean(target && (target === dialog || dialog.contains?.(target) || (target.parent && target.parent === dialog)));

  const keyHandler = (event) => {
    if (!active) return;
    const inside = isInsideDialog(event.target);
    if (event.key === 'Escape') {
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      settle(active, 'cancel');
      return;
    }
    if (event.key === 'Tab') {
      const items = [overwrite, copy, cancel].filter((button) => !button.disabled);
      if (items.length === 0) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      const currentIndex = items.indexOf(document.activeElement);
      const next = event.shiftKey
        ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
        : (currentIndex < 0 || currentIndex === items.length - 1 ? 0 : currentIndex + 1);
      items[next].focus();
      return;
    }
    if (!inside) {
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
    }
  };

  const focusInHandler = (event) => {
    if (!active || isInsideDialog(event.target)) return;
    event.stopPropagation?.(); event.stopImmediatePropagation?.();
    cancel.focus?.();
  };

  const show = ({ filename = '', reason = 'changed', allowOverwrite = true, onSaveCopy = null } = {}) => {
    if (destroyed) return Promise.resolve('cancel');
    if (active) settle(active, 'cancel');
    const name = safeFilename(filename);
    fileLine.textContent = name;
    const unverified = reason === 'unverifiable' || reason === 'unknown';
    const replaced = reason === 'replaced';
    title.textContent = unverified ? 'We couldn’t check this file' : replaced ? 'A different file now has this name' : 'This file changed since you saved';
    overwrite.hidden = unverified || replaced || allowOverwrite === false;
    overwrite.disabled = unverified || replaced || allowOverwrite === false;
    description.textContent = unverified
      ? 'FileOrbit couldn’t confirm what is in the saved file. Choose Save a Copy to keep your edits in a new file, or Cancel.'
      : replaced
        ? 'Your edits are still open. Choose Save a Copy to keep them in a separate file, or Cancel.'
        : 'This file changed outside FileOrbit. Choose Replace Saved File to save over it, Save a Copy to keep both versions, or Cancel to keep your edits open.';
    const request = { id: ++sequence, settled: false, resolve: null, onSaveCopy };
    const promise = new Promise((resolve) => { request.resolve = resolve; });
    active = request;
    lastFocus = document.activeElement || null;
    overlay.hidden = false;
    onKey = keyHandler;
    onFocusIn = focusInHandler;
    document.addEventListener?.('keydown', onKey, true);
    document.addEventListener?.('focusin', onFocusIn, true);
    attachPositioning();
    cancel.focus?.();
    return promise;
  };

  const onOverwrite = () => { if (active) settle(active, 'overwrite'); };
  const onCopy = () => { if (!active) return; const request = active; try { request.onSaveCopy?.(); } catch {} settle(request, 'copy'); };
  const onCancel = () => { if (active) settle(active, 'cancel'); };
  overwrite.addEventListener?.('click', onOverwrite);
  copy.addEventListener?.('click', onCopy);
  cancel.addEventListener?.('click', onCancel);

  return {
    show,
    close() { if (active) settle(active, 'cancel'); },
    get isOpen() { return Boolean(active); },
    get element() { return overlay; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (active) settle(active, 'cancel');
      overlay.remove?.();
    }
  };
}
