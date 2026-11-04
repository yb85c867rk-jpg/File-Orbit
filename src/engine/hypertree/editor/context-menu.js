/** Attach the canvas contextmenu activation listener with exact removal. */
export function attachEditorContextMenu({ canvas, resolve, activate }) {
  if (!canvas || typeof canvas.addEventListener !== 'function') throw new Error('canvas is required');
  const handler = (event) => {
    if (!event || event.button !== 2 || event.defaultPrevented || event.__vdEditorHandled) return;
    const target = resolve(event);
    if (!target) return;
    if (activate(target, event) === true) event.preventDefault();
  };
  canvas.addEventListener('contextmenu', handler);
  return () => canvas.removeEventListener('contextmenu', handler);
}

