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
  const navigator = {
    get busy() { return isTransitionBusy(transition); },
    get transition() { return transition; },
    enterFolder(id) {
      if (navigator.busy) return { ok: false, busy: true, reason: 'transition-busy', id };
      if (id === model.focusedFolderId) {
        const result = session.run('enter-folder', () => ({ ...model.enterFolder(id), fit: false }), { fit: false, eventKind: 'user' });
        return { ...result, mode: 'immediate', changed: false };
      }
      if (!shouldAnimateTransition({ reducedMotion, duration })) {
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
          fit: true, camera: null, cameraLimits, presentation
        });
      } catch (cause) {
        return { ok: false, reason: 'target-fit-failed', id, error: String(cause?.message || cause) };
      }
      try {
        onStart({ id, targetView });
      } catch (cause) {
        transition = null;
        onError({ id, error: cause, reason: 'transition-start-failed' });
        return { ok: false, reason: 'transition-start-failed', id, error: String(cause?.message || cause) };
      }
      try {
        transition = createTransition({
        graph, baseLayout, sourceView: model.view(), targetView,
        sourceCamera: session.getState().camera, targetCamera: targetPrepared.camera,
        viewport, baseRadiusCss, cameraLimits, duration, presentation,
        draw, labels,
        ...transitionOptions,
        onFrame: (sample) => onFrame({ ...sample, id, targetView }),
        onComplete: () => {
          transition = null;
          const result = session.run('enter-folder', () => ({ ...model.enterFolder(id), fit: true }), { fit: false, eventKind: 'user' });
          if (!result.ok) throw result.error || new Error('final installation failed');
          return result;
        },
        onError: (payload) => {
          transition = null;
          onError({ ...payload, id });
        },
        onSettled: (payload) => {
          transition = null;
          onSettled({ ...payload, id });
        }
        });
      } catch (cause) {
        transition = null;
        onError({ id, error: cause });
        return { ok: false, reason: 'transition-start-failed', id, error: String(cause?.message || cause) };
      }
      return { ok: true, mode: 'transition', changed: true, id, transition };
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





