/**
 * Scoped context-menu activation for installed HTML label names.
 * The overlay stays non-blocking; only the label owner at the event point is
 * considered, and activation is delegated to the same editor target path as
 * Canvas glyphs.
 */
export function attachLabelContextMenu({
  document,
  overlay,
  getFrameState,
  getGraph,
  getVisibleSet,
  getDetails,
  activate,
  onDiagnostic = () => {},
  isTransitioning = () => false
}) {
  if (!document || typeof document.addEventListener !== 'function') throw new Error('document is required');
  if (!overlay || typeof overlay.labelAtPoint !== 'function') throw new Error('label overlay is required');
  if (typeof activate !== 'function') throw new Error('activate is required');
  const handler = (event) => {
    if (!event || event.button !== 2 || event.defaultPrevented || event.__vdEditorHandled) return;
    if (event.target?.closest?.('#editor-context-menu, #editor-form, #editor-prompt, aside')) return;
    if (isTransitioning()) {
      onDiagnostic({ reason: 'context-menu-transition-busy' });
      return;
    }
    const label = overlay.labelAtPoint(event.clientX, event.clientY);
    if (!label) return;
    if (!getFrameState()?.hit) {
      onDiagnostic({ reason: 'context-menu-no-coherent-frame', id: label.id });
      return;
    }
    const node = getGraph()?.nodes?.get(label.id);
    const details = getDetails(label.id);
    if (!node || !details || !getVisibleSet()?.has(label.id)) {
      onDiagnostic({ reason: 'context-menu-stale-or-invisible-label', id: label.id });
      return;
    }
    const opened = activate({ id: label.id, kind: details.kind }, event);
    if (opened === true) {
      event.__vdEditorHandled = true;
      event.preventDefault();
    } else {
      onDiagnostic({ reason: 'context-menu-activation-rejected', id: label.id });
    }
  };
  document.addEventListener('contextmenu', handler, true);
  return () => document.removeEventListener('contextmenu', handler, true);
}
