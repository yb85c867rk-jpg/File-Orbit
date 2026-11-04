/**
 * Shared action/frame boundary for the exploration harness.
 *
 * The injected frame callback must draw, update labels, and install matching
 * hit geometry synchronously. The session commits camera/framing/navigation
 * state only after that callback returns successfully.
 */
export function createExplorationSession({
  model,
  frame,
  invalidate,
  publish,
  initialCamera,
  initialFraming = 'fit',
  limits
}) {
  let camera = initialCamera;
  let framing = initialFraming;
  let installing = false;
  let error = null;
  let lastEvent = null;
  let hitActive = false;

  function state() {
    return { camera, framing, installing, error, lastEvent, hitActive };
  }

  function run(operation, prepare, options = {}) {
    if (installing) return { ok: false, busy: true, reason: 'reentrant' };
    installing = true;
    error = null;
    hitActive = false;
    invalidate();
    const before = model.snapshot();
    const beforeCamera = camera;
    const beforeFraming = framing;
    let result = { ok: false };
    try {
      const prepared = prepare();
      if (prepared && prepared.ok === false) {
        throw new Error(prepared.reason || 'action rejected');
      }
      const frameResult = frame({
        operation,
        fit: options.fit === true || prepared?.fit === true,
        entry: options.entry || prepared?.entry || null,
        camera,
        framing,
        viewport: options.viewport
      });
      camera = frameResult.camera;
      framing = frameResult.framing;
      hitActive = true;
      result = { ok: true, ...frameResult };
      lastEvent = { kind: options.eventKind || 'programmatic', operation, success: true };
    } catch (cause) {
      model.restore(before);
      camera = beforeCamera;
      framing = beforeFraming;
      error = cause instanceof Error ? cause : new Error(String(cause));
      lastEvent = { kind: options.eventKind || 'programmatic', operation, success: false, error: error.message };
      result = { ok: false, error };
      hitActive = false;
      invalidate();
    } finally {
      installing = false;
      publish(state());
    }
    return result;
  }

  function applyCamera(nextCamera, meta = {}) {
    if (installing) return false;
    const previousCamera = camera;
    invalidate();
    hitActive = false;
    try {
      const frameResult = frame({ operation: 'camera', fit: false, entry: null, camera: nextCamera, framing: 'manual', viewport: meta.viewport });
      camera = frameResult.camera;
      framing = 'manual';
      hitActive = true;
      error = null;
      lastEvent = { kind: 'user', operation: 'camera', success: true, meta: meta.kind || null };
      publish(state());
      return true;
    } catch (cause) {
      camera = previousCamera;
      error = cause instanceof Error ? cause : new Error(String(cause));
      lastEvent = { kind: 'user', operation: 'camera', success: false, error: error.message };
      hitActive = false;
      publish(state());
      throw error;
    }
  }

  function publishCurrent() { publish(state()); }
  return {
    run,
    applyCamera,
    publish: publishCurrent,
    getState: state,
    setCamera(next, mode = framing) { camera = next; framing = mode; }
  };
}


