/** Shared semantic Save / Discard / Cancel prompt for replacing a dirty map. */
export function createUnsavedMapPrompt({ document, host, onSave, onDiscard, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'unsaved-map-backdrop';
  overlay.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'unsaved-map-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'unsaved-map-title');
  const title = document.createElement('h2'); title.id = 'unsaved-map-title'; title.textContent = 'Unsaved map changes';
  const message = document.createElement('p'); message.textContent = 'This map has changes that are not saved in this browser.';
  const error = document.createElement('p'); error.className = 'unsaved-map-error'; error.setAttribute('role', 'alert');
  const actions = document.createElement('div'); actions.className = 'unsaved-map-actions';
  const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save and continue';
  const discard = document.createElement('button'); discard.type = 'button'; discard.textContent = 'Discard changes';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  actions.append(save, discard, cancel);
  dialog.append(title, message, error, actions);
  overlay.appendChild(dialog); host.appendChild(overlay);
  let open = false; let busy = false; let lastFocus = null; let onKey = null; let saveLabel = 'Save and continue';
  const setBusy = (value, text = 'Saving…') => {
    busy = Boolean(value);
    save.disabled = busy; discard.disabled = busy; cancel.disabled = busy;
    save.textContent = busy ? text : saveLabel;
  };
  const close = ({ restoreFocus = true } = {}) => {
    if (!open) return;
    open = false; overlay.hidden = true; busy = false;
    if (onKey) document.removeEventListener('keydown', onKey, true);
    onKey = null;
    if (restoreFocus && lastFocus?.focus) lastFocus.focus();
    lastFocus = null;
  };
  const show = ({ text = 'This map has changes that are not saved in this browser.', saveLabel: nextLabel = 'Save and continue' } = {}) => {
    if (open) return;
    open = true; busy = false; error.textContent = ''; message.textContent = text; saveLabel = String(nextLabel || 'Save and continue');
    save.disabled = false; discard.disabled = false; cancel.disabled = false; save.textContent = saveLabel;
    lastFocus = document.activeElement || null; overlay.hidden = false;
    onKey = (event) => {
      if (!open) return;
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); onCancel?.(); return; }
      if (event.key !== 'Tab') return;
      const items = [save, discard, cancel].filter((button) => !button.disabled);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index < 0 || index === items.length - 1 ? 0 : index + 1);
      items[next].focus();
    };
    document.addEventListener('keydown', onKey, true);
    save.focus();
  };
  save.addEventListener('click', () => { if (!busy) onSave?.(); });
  discard.addEventListener('click', () => { if (!busy) { close({ restoreFocus: false }); onDiscard?.(); } });
  cancel.addEventListener('click', () => { if (!busy) { close(); onCancel?.(); } });
  return {
    show, close, setBusy,
    showError(messageText) { error.textContent = String(messageText || 'The save failed.'); },
    get isOpen() { return open; },
    get element() { return overlay; },
    destroy() { close({ restoreFocus: false }); overlay.remove(); }
  };
}
