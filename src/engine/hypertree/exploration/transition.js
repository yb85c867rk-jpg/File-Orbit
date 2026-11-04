import { createFocusAnimator } from '../focus/focus-animator.js';
import { focusParameter } from '../focus/focus-view.js';
import { prepareExplorationFrame } from './frame.js';

export const EXPLORATION_TRANSITION_DURATION_MS = 780;

export function shouldAnimateTransition({ reducedMotion = false, duration = EXPLORATION_TRANSITION_DURATION_MS } = {}) {
  return reducedMotion !== true && Number.isFinite(duration) && duration > 0;
}

export function isTransitionBusy(transition) {
  return transition !== null && transition !== undefined && transition.active === true;
}

/** Visibility during motion: bounded union of source and target scopes. */
export function unionView(source, target) {
  const visibleSet = new Set([...source.visibleSet, ...target.visibleSet]);
  const visibleIds = [...visibleSet];
  const ancestorIds = [...new Set([...source.ancestorIds, ...target.ancestorIds])];
  return {
    ...target,
    visibleIds,
    visibleSet,
    ancestorIds,
    transitionUnion: true
  };
}

export function createExplorationTransition({
  graph,
  baseLayout,
  sourceView,
  targetView,
  sourceCamera,
  targetCamera,
  viewport,
  baseRadiusCss,
  cameraLimits,
  presentation = undefined,
  duration = EXPLORATION_TRANSITION_DURATION_MS,
  now,
  requestFrame,
  cancelFrame,
  draw,
  labels,
  onFrame,
  onComplete,
  onError,
  onSettled
}) {
  if (typeof draw !== 'function' || typeof labels !== 'function' || typeof onComplete !== 'function') {
    throw new Error('transition draw, labels, and onComplete are required');
  }
  const union = unionView(sourceView, targetView);
  const fromParameter = focusParameter(baseLayout, sourceView.focusedFolderId, sourceView.phase);
  const targetParameter = focusParameter(baseLayout, targetView.focusedFolderId, targetView.phase);
  let active = true;
  let cancelled = false;
  let failure = null;
  const animator = createFocusAnimator({
    duration,
    now,
    requestFrame,
    cancelFrame,
    onFrame: (sample) => {
      if (!active) return;
      const camera = interpolateCamera(sourceCamera, targetCamera, sample.eased);
      const nodeOpacity = transitionOpacity(sourceView, targetView, sample.eased);
      const prepared = prepareExplorationFrame({
        graph,
        baseLayout,
        view: union,
        focusedStaged: sample.view.staged,
        viewport,
        baseRadiusCss,
        fit: false,
        camera,
        framing: 'manual',
        cameraLimits,
        presentation,
        nodeOpacity,
        padding: 24
      });
      draw(prepared.scene);
      labels(prepared.scene, {
        progress: sample.progress,
        eased: sample.eased,
        camera,
        targetView,
        unionView: union
      });
      if (typeof onFrame === 'function') onFrame({ ...sample, camera, prepared });
    },
    onComplete: () => {
      if (!active) return;
      const result = onComplete();
      if (result && result.ok === false) throw result.error || new Error('final installation failed');
      active = false;
    },
    onCancel: () => { active = false; cancelled = true; },
    onError: (payload) => {
      active = false;
      failure = payload.error;
      if (typeof onError === 'function') onError(payload);
    },
    onSettled: (payload) => {
      active = false;
      if (typeof onSettled === 'function') onSettled(payload);
    }
  });
  const result = animator.start({
    base: baseLayout,
    focusId: targetView.focusedFolderId,
    phase: targetView.phase,
    fromParameter
  });
  if (result.status === 'failed') {
    throw result.error || new Error('transition failed to start');
  }
  const handle = {
    animator,
    duration,
    union,
    fromParameter,
    targetParameter,
    get active() { return active; },
    get cancelled() { return cancelled; },
    get failure() { return failure; },
    cancel(reason = 'cancelled') { const state = animator.cancel(reason); active = false; return state; },
    destroy() { animator.destroy(); active = false; },
    getState() { return animator.getState(); }
  };
  return handle;
}

function interpolateCamera(from, to, eased) {
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
    panX: from.panX + (to.panX - from.panX) * eased,
    panY: from.panY + (to.panY - from.panY) * eased
  };
}
/**
 * Opacity partition for union motion:
 * retained=1, exiting=1-eased, entering=eased.
 */
export function transitionOpacity(sourceView, targetView, eased) {
  const value = Math.min(1, Math.max(0, eased));
  const map = new Map();
  for (const id of sourceView.visibleSet) {
    if (targetView.visibleSet.has(id)) map.set(id, 1);
    else map.set(id, 1 - value);
  }
  for (const id of targetView.visibleSet) {
    if (!sourceView.visibleSet.has(id)) map.set(id, value);
  }
  return map;
}
