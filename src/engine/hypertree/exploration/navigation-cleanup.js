export function finalizeTransitionNavigation({
  overlay, transitionLabels, session, id = null, error = null,
  cancelTransition = true, recover = true, restoreNavigation = () => {}, suspendNavigation = () => {}
}) {
  const originalError = error === null || error === undefined ? null : String(error?.message || error);
  let cleanupError = null;
  if (cancelTransition) {
    try {
      if (transitionLabels && overlay) overlay.cancelTransition();
    } catch (cause) {
      cleanupError = String(cause?.message || cause);
    }
  }
  let recovered = false;
  if (recover) {
    if (session) {
      try {
        const result = session.run('recovery', () => ({ ok: true, fit: false }), { fit: false, eventKind: 'programmatic' });
        recovered = result.ok === true;
      } catch {
        recovered = false;
      }
    }
  } else {
    recovered = cleanupError === null;
  }
  if (recovered) restoreNavigation();
  else suspendNavigation();
  return { originalError, cleanupError, recovered, coherent: recovered };
}
