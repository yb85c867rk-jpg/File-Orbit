/**
 * Shared viewport-resize lifecycle. Surface recreation and exploration-navigator
 * recreation are one transaction: neither navigation path is enabled unless the
 * resized frame installs successfully.
 */
export function performViewportResizeAction({
  session, fit = false,
  cancelTransition = () => {}, teardown = () => {}, recreate = () => {},
  createNavigator = () => {}, createNavigation = () => {},
  onFailure = () => {}, onSuccess = () => {}
}) {
  cancelTransition();
  teardown();
  recreate();
  let result;
  try {
    result = session.run('resize', () => ({ ok: true, fit }), { fit: false, eventKind: 'programmatic' });
  } catch (error) {
    onFailure({ reason: 'resize-frame-failed', error });
    return { ok: false, reason: 'resize-frame-failed', error };
  }
  if (!result || result.ok !== true) {
    onFailure({ reason: 'resize-frame-failed', error: result?.error });
    return { ok: false, reason: 'resize-frame-failed', error: result?.error };
  }
  try {
    createNavigator();
    createNavigation();
  } catch (error) {
    onFailure({ reason: 'resize-navigation-failed', error });
    return { ok: false, reason: 'resize-navigation-failed', error };
  }
  onSuccess({ result });
  return { ok: true, reason: 'resized', result };
}
