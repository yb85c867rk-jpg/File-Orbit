import { clientToCanvasCss, hitTestNode } from '../interaction/index.js';

/**
 * Shared exploration canvas-click action.
 *
 * Ordinary click acceptance uses the left-button contract; it does not require
 * PointerEvent stream metadata such as isPrimary. Drag suppression is owned by
 * the navigation controller's click-capture path.
 */
export function handleExplorationCanvasClick({
  event,
  canvas,
  frameState,
  session,
  model,
  graph,
  onFolder = null,
  onDiagnostic = () => {}
}) {
  const failureMessage = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    return String(value.message || value.error?.message || value.reason || value);
  };
  const reject = (reason, detail = null) => {
    const result = { ok: false, handled: false, reason, detail };
    onDiagnostic(result);
    return result;
  };
  if (!event || event.button !== 0) return reject('non-primary-button');
  if (!frameState) return reject('frame-not-ready');
  if (!session) return reject('session-not-ready');
  let point;
  try {
    point = clientToCanvasCss(canvas, event.clientX, event.clientY);
  } catch (error) {
    return reject('coordinate-error', String(error?.message || error));
  }
  const id = hitTestNode(frameState.hit, point);
  if (!id) {
    const result = session.run('clear-selection', () => {
      model.clearSelection();
      return { ok: true, fit: false };
    }, { fit: false, eventKind: 'user' });
    const value = result.ok
      ? { ok: true, handled: true, reason: 'background-miss', id: null }
      : { ok: false, handled: false, reason: result.reason || 'background-frame-failed', error: failureMessage(result.error) };
    if (!result.ok) onDiagnostic(value);
    return value;
  }
  const kind = graph.nodes.get(id)?.kind;
  if (kind !== 'folder' && kind !== 'file') return reject('unsupported-hit-kind', id);
  const beforeFocused = model.focusedFolderId;
  const action = kind === 'folder' ? 'enter-folder' : 'select-file';
  const result = kind === 'folder' && typeof onFolder === 'function'
    ? onFolder({ id, session, model, graph })
    : session.run(action, () => {
      if (kind === 'folder') {
        const entered = model.enterFolder(id);
        return { ...entered, fit: entered.changed === true };
      }
      return { ...model.select(id), fit: false };
    }, { fit: false, eventKind: 'user' });
  if (!result.ok) {
    const underlying = result.reason || (result.busy ? 'transition-busy' : `${action}-failed`);
    const value = { ok: false, handled: false, reason: underlying, action: `${action}-failed`, id, error: failureMessage(result.error) };
    onDiagnostic(value);
    return value;
  }
  return {
    ok: true,
    handled: true,
    reason: kind === 'folder' ? 'folder-entered' : 'file-selected',
    id,
    kind,
    mode: result.mode || 'immediate',
    changed: result.changed !== undefined ? result.changed : (kind === 'folder' ? model.focusedFolderId !== beforeFocused : false),
    camera: session.getState().camera,
    focusedFolderId: model.focusedFolderId
  };
}







