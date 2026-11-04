import { loadTree } from '../data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../layout/index.js';
import { createExplorationSession } from './session.js';
import { createExplorationModel } from './navigation-model.js';
import { resetCamera, EXPERIMENTAL_CAMERA_LIMITS } from '../navigation/index.js';
import { buildReparentCandidate, resolveDropTarget } from './reparent.js';
import { resolvePostOperationDetails } from '../editor/details-policy.js';

/** Fit is blocked from node pointerdown through drag completion/cancel. */
export function isNodeGestureOwned(gesture) {
  return gesture !== null && gesture !== undefined;
}

/** Execute the accepted recovery frame and report its actual result. */
export function recoverAuthoritativeSession(session) {
  const result = session.run('recovery', () => ({ ok: true, fit: false }), { fit: false, eventKind: 'programmatic' });
  return result?.ok === true;
}

export function fitBlockReason({ gesture, navigatorBusy = false, editorBusy = false }) {
  if (isNodeGestureOwned(gesture)) return 'drag-busy';
  if (navigatorBusy) return 'transition-busy';
  if (editorBusy) return 'editor-busy';
  return null;
}

function prepareCandidate(move, viewport, baseRadiusCss, phase) {
  const loaded = loadTree(move.candidateTree);
  const staged = stageExperimentalV2Layout(loaded.graph, {
    rootId: move.candidateTree.id, phases: ['current'], nodeOptions: { overridable: true }
  });
  const refined = refineExperimentalV2Layout(staged, loaded.graph, {
    viewport, padding: 24, phase, projectionBaseRadiusCss: baseRadiusCss
  });
  return { tree: move.candidateTree, graph: loaded.graph, baseLayout: refined.staged };
}

/**
 * Shared candidate installation action. The caller supplies frame/env/commit/
 * recovery adapters so tests execute the same candidateEnv isolation boundary.
 */
/** Common candidateEnv installation boundary for tree mutations. */
export function installCandidateEnvironment({
  candidate,
  operation = 'candidate',
  prepare = () => ({ ok: true, fit: false }),
  initialCamera,
  initialFraming = 'fit',
  frame,
  invalidate = () => {},
  setCandidateEnv = () => {},
  commit = () => {},
  beforeCommit = () => ({ ok: true }),
  recover = () => false,
  createSession = createExplorationSession
}) {
  setCandidateEnv(candidate);
  let candidateSession = null;
  let installationError = null;
  try {
    candidateSession = createSession({
      model: candidate.model,
      frame,
      invalidate,
      publish: () => {},
      initialCamera,
      initialFraming,
      limits: EXPERIMENTAL_CAMERA_LIMITS
    });
    const result = candidateSession.run(operation, prepare, { fit: false, eventKind: 'user' });
    if (result.ok) {
      setCandidateEnv(null);
      const preparedCommit = beforeCommit(candidate, candidateSession);
      if (preparedCommit && preparedCommit.ok === false) {
        installationError = new Error(preparedCommit.message || 'pre-commit validation failed');
      } else {
        commit(candidate, candidateSession);
        return { ok: true, reason: 'installed', candidate, session: candidateSession, recovered: false };
      }
    } else {
      installationError = result.error || new Error('candidate frame failed');
    }
  } catch (error) {
    installationError = error;
  }
  setCandidateEnv(null);
  let recovered = false;
  try {
    recovered = recover({ candidate, error: installationError, session: candidateSession }) === true;
  } catch (error) {
    installationError = installationError || error;
    recovered = false;
  }
  return {
    ok: false,
    reason: 'installation-failed',
    message: 'Could not apply the change.',
    error: installationError,
    recovered
  };
}
export function performReparentInstallation({
  tree,
  graph,
  model,
  session,
  sourceId,
  targetId,
  gesture,
  generation,
  datasetToken,
  structuralRootId,
  viewport,
  baseRadiusCss,
  phase = 'current',
  frame,
  invalidate = () => {},
  setCandidateEnv = () => {},
  commit = () => {},
  recover = () => false,
  createSession = createExplorationSession,
  makeCandidate = prepareCandidate,
  history = null,
  historyEntry = null,
  view = null,
  currentDetailsTargetId = null
}) {
  const release = resolveDropTarget({ sourceId, hitId: targetId, gesture, generation, datasetToken, structuralRootId });
  if (!release.ok) {
    return {
      ok: false,
      reason: release.reason,
      message: release.reason === 'stale-gesture' ? 'The map changed. Please try dragging again.' : 'Drop onto a folder to move this item.',
      recovered: false
    };
  }
  const targetNode = graph.nodes.get(targetId);
  if (targetNode?.kind !== 'folder') {
    return { ok: false, reason: 'data-target', message: 'Drop onto a folder, not a data item.', recovered: false };
  }
  const move = buildReparentCandidate({ tree, sourceId, targetId, structuralRootId });
  if (!move.ok) {
    const messages = {
      'source-root': 'The root folder cannot be moved.',
      self: 'An item cannot be moved into itself.',
      'descendant-target': 'A folder cannot be moved into one of its subfolders.',
      'data-target': 'Drop onto a folder, not a data item.',
      'stale-id': 'The map changed. Please try dragging again.',
      'existing-parent': 'This item is already in that folder.'
    };
    return { ok: false, reason: move.reason, message: messages[move.reason] || 'This item cannot be moved.', recovered: false };
  }

  let candidate;
  try {
    const prepared = makeCandidate(move, viewport, baseRadiusCss, phase);
    const candidateModel = createExplorationModel({
      graph: prepared.graph, baseLayout: prepared.baseLayout,
      structuralRootId: move.candidateTree.id, phase
    });
    const focusId = view?.focusedFolderId ?? model.focusedFolderId;
    if (prepared.graph.nodes.get(focusId)?.kind === 'folder') candidateModel.enterFolder(focusId);
    const selectedId = Object.prototype.hasOwnProperty.call(view || {}, 'selectedId') ? view.selectedId : model.selectedId;
    if (selectedId && candidateModel.view().visibleSet.has(selectedId)) candidateModel.restoreSelection(selectedId);
    else candidateModel.clearSelection();
    candidate = { ...prepared, model: candidateModel };
  } catch (error) {
    return { ok: false, reason: 'preparation-failed', message: 'Could not prepare the move.', error, recovered: false };
  }

  let historyPlan = null;
  if (history && historyEntry) {
    historyPlan = history.planAdd(historyEntry);
    if (!historyPlan.ok) return historyPlan;
  }
  const useFit = !view || view.framing === 'fit' || !view.viewport || view.viewport.width !== viewport.width || view.viewport.height !== viewport.height;
  const installed = installCandidateEnvironment({
    candidate,
    operation: 'reparent',
    prepare: () => ({ ok: true, fit: useFit }),
    initialCamera: useFit ? resetCamera(EXPERIMENTAL_CAMERA_LIMITS) : view.camera,
    initialFraming: useFit ? 'fit' : view.framing,
    frame, invalidate, setCandidateEnv,
    beforeCommit: (candidateValue, sessionValue) => {
      if (!historyPlan || !historyEntry) return { ok: true };
      const candidateState = sessionValue.getState();
      const detailsTargetId = resolvePostOperationDetails({ operation: 'reparent', currentDetailsTargetId, sourceId, model: candidateValue.model, graph: candidateValue.graph });
      const finalEntry = { ...historyEntry, viewAfter: { ...historyEntry.viewAfter, focusedFolderId: candidateValue.model.focusedFolderId, selectedId: candidateValue.model.selectedId ?? null, detailsTargetId, camera: { ...candidateState.camera }, framing: candidateState.framing, viewport } };
      const finalPlan = history.planAdd(finalEntry);
      if (!finalPlan.ok) return finalPlan;
      historyPlan = finalPlan;
      historyEntry = finalEntry;
      return { ok: true };
    },
    commit: (candidateValue, sessionValue) => { commit(candidateValue, sessionValue); if (historyPlan) history.commitAdd(historyPlan); },
    recover: recover || (() => false),
    createSession
  });
  if (!installed.ok) installed.message = 'Could not apply the move.';
  return installed;
}














