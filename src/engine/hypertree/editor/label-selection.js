/**
 * Capture-phase selection handler for visible data label icon/name groups.
 * The injected click-suppression predicate is the single ownership boundary
 * shared with the label drag controller.
 */
export function attachLabelSelection({
  host,
  overlay,
  getFrameState,
  getDetails,
  isBlocked = () => false,
  isClickSuppressed = () => false,
  select
}) {
  if (!host || typeof host.addEventListener !== 'function') throw new Error('label host is required');
  if (!overlay || typeof overlay.labelAtPoint !== 'function') throw new Error('label overlay is required');
  if (typeof select !== 'function') throw new Error('select callback is required');
  const handler = (event) => {
    if (!event || event.button !== 0 || event.defaultPrevented || event.__vdEditorHandled) return;
    if (isClickSuppressed()) return;
    if (event.target?.closest?.('[data-vd-link], #editor-context-menu, #editor-form, #editor-prompt, aside')) return;
    if (isBlocked() || !getFrameState()?.hit) return;
    const label = overlay.labelAtPoint(event.clientX, event.clientY);
    if (!label) return;
    const details = getDetails(label.id);
    if (!details || details.kind !== 'file') return;
    const nameTarget = event.target?.closest?.('[data-vd-name]') ? 'file-name' : null;
    const geometry = overlay.labelActivationAtPoint?.(event.clientX, event.clientY) || null;
    const activation = nameTarget || (geometry?.id === label.id ? geometry.activation : 'icon');
    select(label.id, { activation });
  };
  host.addEventListener('click', handler, true);
  return () => host.removeEventListener('click', handler, true);
}





