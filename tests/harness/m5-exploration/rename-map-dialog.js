export function createRenameMapDialog({ document, host, onValidate, onSubmit, onCancel } = {}) {
  if (!document || !host) throw new Error('rename dialog requires document and host');
  const backdrop = document.createElement('div');
  backdrop.className = 'embed-dialog-backdrop rename-map-backdrop';
  backdrop.hidden = true;
  const dialog = document.createElement('section');
  dialog.className = 'embed-dialog rename-map-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'rename-map-title');
  dialog.setAttribute('aria-describedby', 'rename-map-copy');
  const head = document.createElement('div'); head.className = 'embed-dialog-head';
  const title = document.createElement('h2'); title.id = 'rename-map-title'; title.textContent = 'Rename Map';
  head.append(title);
  const body = document.createElement('div'); body.className = 'embed-dialog-copy';
  const explanation = document.createElement('p'); explanation.id = 'rename-map-copy'; explanation.textContent = 'Change the map title and its .orbit filename together.';
  const currentRow = document.createElement('p');
  const currentLabel = document.createElement('strong'); currentLabel.textContent = 'Current filename: ';
  const currentName = document.createElement('span'); currentName.id = 'rename-map-current';
  currentRow.append(currentLabel, currentName);
  const parentRow = document.createElement('p');
  const parentLabel = document.createElement('strong'); parentLabel.textContent = 'Verified parent folder: ';
  const parentName = document.createElement('span'); parentName.id = 'rename-map-parent';
  parentRow.append(parentLabel, parentName);
  const field = document.createElement('label'); field.className = 'create-map-field';
  const fieldLabel = document.createElement('span'); fieldLabel.textContent = 'Map name';
  const input = document.createElement('input');
  input.id = 'rename-map-name'; input.name = 'mapName'; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('role', 'textbox');
  field.append(fieldLabel, input);
  const previewRow = document.createElement('p');
  const previewLabel = document.createElement('strong'); previewLabel.textContent = 'Proposed filename: ';
  const previewName = document.createElement('span'); previewName.id = 'rename-map-preview';
  previewRow.append(previewLabel, previewName);
  const adjusted = document.createElement('p'); adjusted.id = 'rename-map-adjusted'; adjusted.hidden = true;
  const status = document.createElement('p'); status.id = 'rename-map-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'embed-dialog-actions permission-dialog-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  const submit = document.createElement('button'); submit.type = 'button'; submit.textContent = 'Rename Map'; submit.disabled = true;
  actions.append(cancel, submit);
  body.append(explanation, currentRow, parentRow, field, previewRow, adjusted, status, actions);
  dialog.append(head, body); backdrop.append(dialog); host.append(backdrop);

  let open = false; let busy = false; let lastFocus = null; let validation = null; let validateSeq = 0; let validateTimer = null;

  const setStatus = (message, kind = 'info') => { status.textContent = String(message || ''); status.dataset.kind = kind; };
  const sync = () => {
    const valid = Boolean(validation?.ok);
    input.disabled = !open || busy;
    cancel.disabled = !open || busy;
    submit.disabled = !open || busy || !valid;
    submit.textContent = validation?.noop ? 'Close' : 'Rename Map';
    dialog.setAttribute('aria-busy', String(busy));
  };
  const close = ({ restoreFocus = true, notify = true } = {}) => {
    if (!open || busy) return false;
    open = false; validation = null; busy = false;
    if (validateTimer !== null) { clearTimeout(validateTimer); validateTimer = null; }
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (notify) onCancel?.();
    if (restoreFocus) { try { lastFocus?.focus?.(); } catch {} }
    lastFocus = null;
    sync();
    return true;
  };
  function focusables() { return [input, cancel, submit].filter((el) => !el.disabled && !el.hidden); }
  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) close(); return; }
    if (event.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const current = document.activeElement;
    const direction = event.shiftKey ? -1 : 1;
    let index = list.indexOf(current);
    if (index < 0) index = direction > 0 ? -1 : 0;
    event.preventDefault();
    list[(index + direction + list.length) % list.length].focus();
  };
  async function validate(value) {
    const seq = ++validateSeq;
    let result;
    try { result = await onValidate?.(value); }
    catch (error) { result = { ok: false, message: String(error?.message || error) }; }
    if (!open || seq !== validateSeq) return;
    validation = result || null;
    if (validation?.ok) {
      previewName.textContent = validation.filename || '';
      input.setAttribute('aria-invalid', 'false');
      if (validation.adjusted && validation.adjusted !== validation.title) {
        adjusted.hidden = false;
        adjusted.textContent = 'Adjusted map title: ' + validation.adjusted;
      } else {
        adjusted.hidden = true; adjusted.textContent = '';
      }
      if (validation.noop) setStatus('The title and filename already match. No file will be changed.', 'ok');
      else if (validation.requiresConfirmation) setStatus('The name will be adjusted before confirmation.', 'info');
      else setStatus(validation.message || '', 'info');
    } else {
      previewName.textContent = validation?.filename || '—';
      input.setAttribute('aria-invalid', 'true');
      adjusted.hidden = true; adjusted.textContent = '';
      setStatus(String(validation?.message || 'The proposed name is not valid.'), 'error');
    }
    sync();
  }
  const scheduleValidation = () => {
    if (validateTimer !== null) clearTimeout(validateTimer);
    const value = input.value;
    validateTimer = setTimeout(() => { validateTimer = null; if (open) void validate(value); }, 90);
  };
  input.addEventListener('input', scheduleValidation);
  cancel.addEventListener('click', () => { if (!busy) close(); });
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop && !busy) close(); });
  submit.addEventListener('click', async () => {
    if (!open || busy || !validation?.ok) return;
    busy = true; sync(); setStatus('Preparing the rename…');
    let result;
    try { result = await onSubmit?.({ name: input.value }); }
    catch (error) { result = { ok: false, message: String(error?.message || error) }; }
    if (!open) return;
    busy = false;
    sync();
    if (result?.ok) { close({ notify: false, restoreFocus: true }); return; }
    setStatus(String(result?.message || 'The map could not be renamed.'), 'error');
  });

  function show({ titleValue = '', filename = '', parent = '', currentTitle = '' } = {}) {
    if (open) return false;
    open = true; busy = false; validation = null; validateSeq += 1;
    input.value = String(titleValue || '');
    currentName.textContent = String(filename || '');
    parentName.textContent = String(parent || 'Unverifiable parent');
    previewName.textContent = '—';
    adjusted.hidden = true; adjusted.textContent = '';
    setStatus('');
    backdrop.hidden = false;
    lastFocus = document.activeElement || null;
    document.addEventListener('keydown', onKey, true);
    sync();
    input.focus();
    if (input.value !== String(currentTitle || '')) input.select?.();
    void validate(input.value);
    return true;
  }

  return { show, close, get open() { return open; }, get busy() { return busy; }, get validation() { return validation; }, get element() { return backdrop; }, get input() { return input; }, get submitButton() { return submit; }, destroy() { close({ restoreFocus: false, notify: false }); backdrop.remove(); } };
}
