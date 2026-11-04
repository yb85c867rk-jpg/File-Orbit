export function createEmbedDialog({ document, host, fixtureUrl = './embed-host.html', appRoot = null }) {
  if (!document || !host) throw new Error('embed dialog requires document and host');
  let backdrop = null;
  let dialog = null;
  let closeButton = null;
  let onKey = null;
  let onBackdrop = null;
  let invoker = null;
  let inerted = [];
  const root = appRoot || document.querySelector('#app-root');

  const focusables = () => [...(dialog?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
    .filter((node) => !node.hidden && node.offsetParent !== null);

  const restoreBackground = () => {
    for (const node of inerted) node.inert = false;
    inerted = [];
  };
  const close = ({ restoreFocus = true } = {}) => {
    if (!backdrop) return;
    if (onKey) document.removeEventListener('keydown', onKey, true);
    if (onBackdrop && backdrop) backdrop.removeEventListener('click', onBackdrop);
    backdrop.remove();
    backdrop = null; dialog = null; closeButton = null; onKey = null; onBackdrop = null;
    restoreBackground();
    if (restoreFocus) {
      const target = invoker && invoker.isConnected ? invoker : document.querySelector('#embed-action');
      target?.focus?.();
    }
    invoker = null;
  };
  const open = ({ invoker: invoking = null } = {}) => {
    if (backdrop) return;
    invoker = invoking && invoking.isConnected ? invoking : document.querySelector('#embed-action');
    if (root) {
      for (const child of [...root.children]) {
        if (child === host || child.inert) continue;
        inerted.push(child);
        child.inert = true;
      }
    }
    backdrop = document.createElement('div');
    backdrop.className = 'embed-dialog-backdrop';
    dialog = document.createElement('section');
    dialog.className = 'embed-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'embed-dialog-title');
    dialog.setAttribute('aria-describedby', 'embed-dialog-copy');
    const head = document.createElement('div'); head.className = 'embed-dialog-head';
    const title = document.createElement('h2'); title.id = 'embed-dialog-title'; title.textContent = 'Embed FileOrbit';
    closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'embed-dialog-close'; closeButton.textContent = 'Close'; closeButton.setAttribute('aria-label', 'Close Embed dialog');
    head.append(title, closeButton);
    const copy = document.createElement('div'); copy.id = 'embed-dialog-copy'; copy.className = 'embed-dialog-copy';
    const local = document.createElement('p'); local.innerHTML = '<strong>Local read-only preview:</strong> open the development host fixture. It embeds the viewer in a real sandboxed iframe with a synthetic snapshot.';
    const external = document.createElement('p'); external.innerHTML = '<strong>Externally usable embed URL:</strong> not available. FileOrbit has no map hosting, publishing, stable embed URL, access policy, or sharing service in this build.';
    const limits = document.createElement('p'); limits.innerHTML = '<strong>Snapshot boundary:</strong> local files, IndexedDB, handles, permissions, attachments, and private paths are not exposed. File opening is unavailable in the embedded viewer.';
    const actions = document.createElement('div'); actions.className = 'embed-dialog-actions';
    const link = document.createElement('a'); link.className = 'embed-dialog-link'; link.href = fixtureUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open local iframe preview';
    const copyButton = document.createElement('button'); copyButton.type = 'button'; copyButton.className = 'embed-dialog-copy-button'; copyButton.disabled = true; copyButton.textContent = 'Copy embed code — unavailable until hosting exists'; copyButton.title = 'No production embed URL exists.';
    actions.append(link, copyButton); copy.append(local, external, limits, actions); dialog.append(head, copy); backdrop.appendChild(dialog); host.appendChild(backdrop);
    closeButton.addEventListener('click', () => close());
    onBackdrop = (event) => { if (event.target === backdrop) close(); };
    backdrop.addEventListener('click', onBackdrop);
    onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0]; const last = items.at(-1); const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog?.contains(active)) { event.preventDefault(); last.focus?.(); }
      } else if (active === last || !dialog?.contains(active)) { event.preventDefault(); first.focus?.(); }
    };
    document.addEventListener('keydown', onKey, true);
    closeButton.focus?.();
  };
  return { open, close, get isOpen() { return Boolean(backdrop); } };
}
