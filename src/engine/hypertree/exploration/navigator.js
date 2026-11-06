import { deriveSubtreeView } from './navigation-model.js';
import { createExplorationTransition, isTransitionBusy, shouldAnimateTransition } from './transition.js';
import { prepareExplorationFrame } from './frame.js';

/**
 * Shared folder-navigation action used by the harness and integration tests.
 * Immediate and transition paths are mutually exclusive; transition owns frame
 * replacement until final installation.
 */
export function createExplorationNavigator({
  graph,
  baseLayout,
  model,
  session,
  viewport,
  baseRadiusCss,
  cameraLimits,
  fitSubtree = false,
  presentation = undefined,
  duration = 780,
  reducedMotion = false,
  prepare = prepareExplorationFrame,
  createTransition = createExplorationTransition,
  transitionOptions = {},
  draw,
  labels,
  onStart = () => {},
  onFrame = () => {},
  onError = () => {},
  onSettled = () => {}
}) {
  let transition = null;
  let transitionToken = 0;
  const navigator = {
    get busy() { return isTransitionBusy(transition); },
    get transition() { return transition; },
    enterFolder(id) {
      const replacing = navigator.busy;
      const prior = replacing ? transition : null;
      const displayed = prior?.getDisplayedState?.() || null;
      if (replacing && !displayed?.parameter) return { ok: false, busy: true, reason: 'transition-busy', id };
      if (!replacing && id === model.focusedFolderId) {
        const result = session.run('enter-folder', () => ({ ...model.enterFolder(id), fit: false }), { fit: false, eventKind: 'user' });
        return { ...result, mode: 'immediate', changed: false };
      }
      if (!shouldAnimateTransition({ reducedMotion, duration })) {
        if (replacing) { transitionToken += 1; prior.cancel('retarget-immediate'); transition = null; }
        const result = session.run('enter-folder', () => {
          const entered = model.enterFolder(id);
          return { ...entered, fit: entered.changed === true };
        }, { fit: false, eventKind: 'user' });
        return { ...result, mode: 'immediate' };
      }
      const targetView = deriveSubtreeView({
        graph, baseLayout, focusedFolderId: id, structuralRootId: model.structuralRootId, phase: 'current'
      });
      let targetPrepared;
      try {
        targetPrepared = prepare({
          graph, baseLayout, view: targetView, viewport, baseRadiusCss,
          fit: true, fitSubtree, camera: null, cameraLimits, presentation
        });
      } catch (cause) {
        return { ok: false, reason: 'target-fit-failed', id, error: String(cause?.message || cause) };
      }
      if (replacing) { transitionToken += 1; prior.cancel('retarget'); transition = null; }
      try {
        onStart({ id, targetView });
      } catch (cause) {
        transition = null;
        onError({ id, error: cause, reason: 'transition-start-failed' });
        return { ok: false, reason: 'transition-start-failed', id, error: String(cause?.message || cause) };
      }
      const token = ++transitionToken;
      try {
        transition = createTransition({
        graph, baseLayout, sourceView: replacing ? prior.union : model.view(), targetView,
        sourceCamera: replacing ? displayed.camera : session.getState().camera, targetCamera: targetPrepared.camera,
        sourceParameter: replacing ? displayed.parameter : null,
        sourceOpacity: replacing ? displayed.opacity : null,
        viewport, baseRadiusCss, cameraLimits, duration, presentation,
        draw, labels,
        ...transitionOptions,
        onFrame: (sample) => { if (token !== transitionToken) return; onFrame({ ...sample, id, targetView }); },
        onComplete: () => {
          if (token !== transitionToken) return;
          transition = null;
          const result = session.run('enter-folder', () => ({ ...model.enterFolder(id), fit: true }), { fit: false, eventKind: 'user' });
          if (!result.ok) throw result.error || new Error('final installation failed');
          return result;
        },
        onError: (payload) => {
          if (token !== transitionToken) return;
          transition = null;
          onError({ ...payload, id });
        },
        onSettled: (payload) => {
          if (token !== transitionToken) return;
          transition = null;
          onSettled({ ...payload, id });
        }
        });
      } catch (cause) {
        transition = null;
        onError({ id, error: cause });
        return { ok: false, reason: 'transition-start-failed', id, error: String(cause?.message || cause) };
      }
      return { ok: true, mode: 'transition', changed: true, replaced: replacing, id, transition };
    },
    cancel(reason = 'cancelled') {
      if (!transition) return { ok: false, reason: 'no-transition' };
      transition.cancel(reason);
      transition = null;
      return { ok: true, reason };
    }
  };
  return navigator;
}





