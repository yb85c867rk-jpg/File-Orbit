import { loadTree } from '../data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout, V2_DEFAULTS } from '../layout/index.js';
import { createExplorationModel } from '../exploration/navigation-model.js';
import { installCandidateEnvironment } from '../exploration/reparent-action.js';
import { resetCamera, EXPERIMENTAL_CAMERA_LIMITS } from '../navigation/index.js';
import { buildRenameCommand, buildAddChildCommand, buildMetadataCommand, buildEditFolderCommand, buildEditDataCommand, buildDeleteCommand } from './commands.js';
import { makeMetadataHistoryEntry, makeAddHistoryEntry, makeReparentHistoryEntry, makeDeleteHistoryEntry } from './history-commands.js';
import { resolvePostOperationDetails } from './details-policy.js';
import { validateEditorAdmission } from './validation.js';

function candidateShape(tree) {
  const childCounts = new Map();
  const depths = new Map();
  let nodeCount = 0;
  let folderCount = 0;
  let fileCount = 0;
  let maxDepth = 0;
  const walk = (node, depth) => {
    nodeCount += 1;
    if (node.kind === 'folder') folderCount += 1; else fileCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    depths.set(node.id, depth);
    childCounts.set(node.id, Array.isArray(node.children) ? node.children.length : 0);
    for (const child of node.children || []) walk(child, depth + 1);
  };
  if (tree) walk(tree, 0);
  return { nodeCount, folderCount, fileCount, maxDepth, depths, childCounts };
}

function preparationDiagnostics({ command, error, loaded, shape }) {
  const failure = error?.diagnostics || null;
  const unsatisfied = failure?.unsatisfied?.[0] || null;
  const failingParentId = unsatisfied?.parentId || null;
  const candidateNodeCount = loaded?.graph?.nodes?.size ?? shape.nodeCount;
  const effective = {
    ...V2_DEFAULTS,
    ...(command.layoutExperiment || {}),
    ...(failure ? {
      workspaceScale: failure.workspaceScale,
      workspaceScaleMax: failure.maxWorkspaceScale,
      glyphRadiusCss: failure.glyphRadiusCss,
      clearanceCss: failure.clearanceCss,
      referenceProjectionRadiusCss: failure.referenceProjectionRadiusCss
    } : {})
  };
  return {
    operation: command.operation || null,
    code: error?.code || null,
    message: String(error?.message || error || ''),
    source: command.diagnosticSource || null,
    candidate: {
      nodeCount: candidateNodeCount,
      folderCount: shape.folderCount,
      fileCount: shape.fileCount,
      maxDepth: shape.maxDepth,
      rootChildCount: shape.childCounts.get(command.candidateTree?.id) ?? null
    },
    layout: {
      comparisonMode: command.diagnosticSource?.comparisonMode ?? null,
      requestedProjectionRadiusCss: command.diagnosticSource?.requestedProjectionRadius ?? null,
      requestedExperiment: command.layoutExperiment || null,
      effectiveReferenceProjectionRadiusCss: effective.referenceProjectionRadiusCss,
      effective: {
        referenceProjectionRadiusCss: effective.referenceProjectionRadiusCss,
        glyphRadiusCss: effective.glyphRadiusCss,
        clearanceCss: effective.clearanceCss,
        bandCount: effective.bandCount,
        radialFlex: effective.radialFlex,
        branchWeight: effective.branchWeight,
        demandCompression: effective.demandCompression,
        safetyMargin: effective.safetyMargin,
        minStep: effective.minStep,
        workspaceScaleMin: effective.workspaceScaleMin,
        workspaceScaleMax: effective.workspaceScaleMax,
        workspaceScaleStep: effective.workspaceScaleStep
      },
      workspaceScale: failure?.workspaceScale ?? null,
      attemptCount: failure?.attemptCount ?? null,
      candidateCount: failure?.candidateCount ?? null,
      glyphRadiusCss: failure?.glyphRadiusCss ?? effective.glyphRadiusCss,
      clearanceCss: failure?.clearanceCss ?? effective.clearanceCss,
      referenceProjectionRadiusCss: failure?.referenceProjectionRadiusCss ?? effective.referenceProjectionRadiusCss
    },
    failingParent: failingParentId ? {
      id: failingParentId,
      depth: shape.depths.get(failingParentId) ?? null,
      directChildCount: shape.childCounts.get(failingParentId) ?? null
    } : null,
    unsatisfied: failure?.unsatisfied || [],
    required: unsatisfied?.required ?? null,
    available: unsatisfied?.available ?? null
  };
}

/**
 * Shared installation boundary for metadata-preserving and structural editor
 * commands. Candidate refs are published only after frame success.
 */
export function performEditorCommandInstallation({
  command,
  tree,
  model,
  session,
  structuralRootId,
  viewport,
  baseRadiusCss = 198.66,
  phase = 'current',
  frame,
  invalidate = () => {},
  setCandidateEnv = () => {},
  commit = () => {},
  recover = () => false,
  createSession,
  history = null,
  historyEntry = null
}) {
  if (!command.ok) return command;
  if (command.noop) return { ok: true, reason: 'noop', noop: true, revision: command.baseRevision ?? null };
  let historyPlan = null;
  let retainedHistoryEntry = historyEntry ?? command.historyEntry ?? null;
  if (history && retainedHistoryEntry) {
    historyPlan = history.planAdd(retainedHistoryEntry);
    if (!historyPlan.ok) return historyPlan;
  }
  let candidate;
  let loaded = null;
  const candidateShapeInfo = candidateShape(command.candidateTree);
  try {
    loaded = loadTree(command.candidateTree);
    let candidateBaseLayout;
    if (command.layoutMode === 'preserve') {
      candidateBaseLayout = command.baseLayout;
    } else {
      const staged = stageExperimentalV2Layout(loaded.graph, {
        rootId: command.candidateTree.id, phases: ['current'], nodeOptions: { overridable: true },
        ...(command.layoutExperiment ? { experimentV2: command.layoutExperiment } : {})
      });
      const refined = refineExperimentalV2Layout(staged, loaded.graph, {
        viewport, padding: 24, phase, projectionBaseRadiusCss: baseRadiusCss,
        ...(command.layoutDiagnosticMaxNodes ? { diagnosticMaxNodes: command.layoutDiagnosticMaxNodes } : {})
      });
      candidateBaseLayout = refined.staged;
    }
    const candidateModel = createExplorationModel({
      graph: loaded.graph, baseLayout: candidateBaseLayout, structuralRootId, phase
    });
    const savedView = command.view || null;
    const focusCandidate = savedView && Object.prototype.hasOwnProperty.call(savedView, 'focusedFolderId') ? savedView.focusedFolderId : model.focusedFolderId;
    const focusId = loaded.graph.nodes.get(focusCandidate)?.kind === 'folder' ? focusCandidate : model.focusedFolderId;
    if (loaded.graph.nodes.get(focusId)?.kind === 'folder') candidateModel.enterFolder(focusId);
    const hasSelect = Object.prototype.hasOwnProperty.call(command, 'selectId') || (savedView && Object.prototype.hasOwnProperty.call(savedView, 'selectedId'));
    const selectId = hasSelect ? (Object.prototype.hasOwnProperty.call(command, 'selectId') ? command.selectId : savedView.selectedId) : model.selectedId;
    if (selectId && candidateModel.view().visibleSet.has(selectId)) candidateModel.restoreSelection(selectId);
    else candidateModel.clearSelection();
    candidate = { tree: command.candidateTree, graph: loaded.graph, baseLayout: candidateBaseLayout, model: candidateModel };
  } catch (error) {
    return {
      ok: false, reason: 'preparation-failed',
      message: `Editor preparation failed: ${String(error?.message || error)}`,
      error, recovered: false,
      diagnostics: preparationDiagnostics({ command, error, loaded, shape: candidateShapeInfo })
    };
  }
  const state = session.getState();
  const recompute = command.layoutMode !== 'preserve';
  const savedView = command.view || null;
  const sameViewport = !savedView?.viewport || (savedView.viewport.width === viewport.width && savedView.viewport.height === viewport.height);
  const useFit = recompute || (savedView ? savedView.framing === 'fit' || !sameViewport : false);
  const installed = installCandidateEnvironment({
    candidate,
    operation: command.operation || 'editor',
    prepare: () => ({ ok: true, fit: useFit }),
    initialCamera: useFit ? resetCamera(EXPERIMENTAL_CAMERA_LIMITS) : (savedView?.camera || state.camera),
    initialFraming: useFit ? 'fit' : (savedView?.framing || state.framing),
    beforeCommit: (candidateValue, candidateSession) => {
      if (!historyPlan || !retainedHistoryEntry) return { ok: true };
      const candidateState = candidateSession.getState();
      const selectedId = candidateValue.model.selectedId ?? null;
      const detailsTargetId = resolvePostOperationDetails({
        operation: command.operation, currentDetailsTargetId: retainedHistoryEntry.viewAfter?.detailsTargetId,
        parentId: command.parentId, targetId: command.targetId,
        model: candidateValue.model, graph: candidateValue.graph
      });
      const finalEntry = {
        ...retainedHistoryEntry,
        viewAfter: {
          ...retainedHistoryEntry.viewAfter,
          focusedFolderId: candidateValue.model.focusedFolderId,
          selectedId, detailsTargetId,
          camera: { ...candidateState.camera },
          framing: candidateState.framing,
          viewport: { ...viewport }
        }
      };
      const finalPlan = history.planAdd(finalEntry);
      if (!finalPlan.ok) return finalPlan;
      historyPlan = finalPlan;
      retainedHistoryEntry = finalEntry;
      return { ok: true };
    },
    frame,
    invalidate,
    setCandidateEnv,
    commit: (installedCandidate, installedSession) => {
      commit(installedCandidate, installedSession);
      if (historyPlan) history.commitAdd(historyPlan);
    },
    recover,
    ...(createSession ? { createSession } : {})
  });
  if (!installed.ok) {
    installed.message = `Editor installation failed: ${String(installed.error?.message || installed.error || 'unknown')}`;
    return installed;
  }
  return { ...installed, revision: (command.baseRevision ?? 0) + 1, historyCommitted: Boolean(historyPlan), actionLabel: command.actionLabel || null };
}

export function performRenameInstallation(args) {
  const command = buildRenameCommand({
    tree: args.tree, targetId: args.targetId, draftName: args.draftName,
    datasetToken: args.datasetToken, baseRevision: args.baseRevision,
    expectedDatasetToken: args.expectedDatasetToken, expectedRevision: args.expectedRevision,
    policyContext: args.policyContext, maxNodes: args.maxNodes
  });
  if (command.noop) return { ok: true, reason: 'noop', noop: true, revision: args.baseRevision };
  if (!command.ok) return command;
  return performEditorCommandInstallation({
    ...args,
    history: args.history,
    command: attachHistory(args, { ...command, operation: 'rename', baseLayout: args.baseLayout, baseRevision: args.baseRevision }, 'Rename')
  });
}

export function performAddChildInstallation(args) {
  const command = buildAddChildCommand({
    tree: args.tree, parentId: args.parentId, kind: args.kind,
    draftName: args.draftName, draftDescription: args.draftDescription, draftLink: args.draftLink,
    draftDataType: args.draftDataType, draftAttachment: args.draftAttachment,
    parentDepth: args.parentDepth, baseLayoutDepth: args.baseLayout?.depths?.get(args.parentId),
    datasetToken: args.datasetToken, baseRevision: args.baseRevision,
    expectedDatasetToken: args.expectedDatasetToken, expectedRevision: args.expectedRevision,
    allocator: args.allocator, policyContext: args.policyContext, maxNodes: args.maxNodes
  });
  if (!command.ok || command.noop) return { ...command, baseRevision: args.baseRevision };
  const actionLabel = command.kind === 'file' ? 'Add Data' : 'Add Folder';
  const historyEntry = args.history ? makeAddHistoryEntry({
    action: actionLabel, tree: args.tree, candidateTree: command.candidateTree,
    parentId: command.parentId, nodeId: command.nodeId,
    viewBefore: args.historyViewBefore, viewAfter: args.historyViewAfter, datasetToken: args.datasetToken,
    policyContext: args.policyContext, maxNodes: args.maxNodes
  }) : null;
  return performEditorCommandInstallation({
    ...args, history: args.history,
    command: { ...command, operation: command.kind === 'file' ? 'add-data' : 'add-folder', baseRevision: args.baseRevision, historyEntry, actionLabel }
  });
}

export function performUploadInstallation(args) {
  const admitted = validateEditorAdmission(args.candidateTree, { policyContext: args.policyContext, maxNodes: args.maxNodes });
  if (!admitted.ok) return admitted;
  return performEditorCommandInstallation({
    ...args,
    history: args.history,
    command: {
      ok: true,
      candidateTree: args.candidateTree,
      layoutMode: 'recompute',
      operation: 'upload',
      parentId: args.parentId,
      baseRevision: args.baseRevision,
      actionLabel: 'Upload',
      historyEntry: args.historyEntry || null,
      view: args.historyViewAfter || null,
      layoutExperiment: args.layoutExperiment || null,
      layoutDiagnosticMaxNodes: args.layoutDiagnosticMaxNodes || null,
      diagnosticSource: args.diagnosticSource || null
    }
  });
}

export function performMetadataInstallation(args) {
  const command = buildMetadataCommand({
    tree: args.tree, targetId: args.targetId,
    description: args.description, link: args.link, linkProvided: args.linkProvided,
    datasetToken: args.datasetToken, baseRevision: args.baseRevision,
    expectedDatasetToken: args.expectedDatasetToken, expectedRevision: args.expectedRevision,
    policyContext: args.policyContext, maxNodes: args.maxNodes
  });
  if (command.noop) return { ok: true, reason: 'noop', noop: true, revision: args.baseRevision };
  if (!command.ok) return command;
  return performEditorCommandInstallation({
    ...args,
    history: args.history,
    command: attachHistory(args, { ...command, operation: 'edit-details', baseLayout: args.baseLayout, baseRevision: args.baseRevision }, 'Edit details')
  });
}
export function performEditFolderInstallation(args) {
  const command = buildEditFolderCommand({ tree: args.tree, targetId: args.targetId, draftName: args.draftName, draftDescription: args.draftDescription, datasetToken: args.datasetToken, baseRevision: args.baseRevision, expectedDatasetToken: args.expectedDatasetToken, expectedRevision: args.expectedRevision, policyContext: args.policyContext, maxNodes: args.maxNodes });
  if (command.noop) return { ok: true, reason: 'noop', noop: true, revision: args.baseRevision };
  if (!command.ok) return command;
  return performEditorCommandInstallation({ ...args, history: args.history, command: attachHistory(args, { ...command, baseLayout: args.baseLayout, baseRevision: args.baseRevision }, 'Edit Folder') });
}

export function performEditDataInstallation(args) {
  const command = buildEditDataCommand({ tree: args.tree, targetId: args.targetId, draftName: args.draftName, description: args.description, link: args.link, linkProvided: args.linkProvided, datasetToken: args.datasetToken, baseRevision: args.baseRevision, expectedDatasetToken: args.expectedDatasetToken, expectedRevision: args.expectedRevision, policyContext: args.policyContext, maxNodes: args.maxNodes });
  if (command.noop) return { ok: true, reason: 'noop', noop: true, revision: args.baseRevision };
  if (!command.ok) return command;
  return performEditorCommandInstallation({ ...args, history: args.history, command: attachHistory(args, { ...command, baseLayout: args.baseLayout, baseRevision: args.baseRevision }, 'Edit Data') });
}
function attachHistory(args, command, actionLabel) {
  if (!args.history) return { ...command, actionLabel };
  const entry = makeMetadataHistoryEntry({
    action: actionLabel, tree: args.tree, candidateTree: command.candidateTree,
    targetId: args.targetId, viewBefore: args.historyViewBefore, viewAfter: args.historyViewAfter,
    datasetToken: args.datasetToken
  });
  return { ...command, actionLabel, historyEntry: entry };
}
export function performDeleteInstallation(args) {
  const command = buildDeleteCommand({
    tree: args.tree, targetId: args.targetId, structuralRootId: args.structuralRootId,
    datasetToken: args.datasetToken, datasetTokenExpected: args.expectedDatasetToken,
    baseRevision: args.baseRevision, expectedRevision: args.expectedRevision,
    baseLayout: args.baseLayout,
    viewBefore: args.historyViewBefore,
    policyContext: args.policyContext, maxNodes: args.maxNodes
  });
  if (!command.ok) return command;
  const historyEntry = args.history ? makeDeleteHistoryEntry({
    action: command.actionLabel, tree: args.tree, candidateTree: command.candidateTree,
    targetId: args.targetId, structuralRootId: args.structuralRootId, datasetToken: args.datasetToken,
    viewBefore: args.historyViewBefore, viewAfter: command.view,
    policyContext: args.policyContext, maxNodes: args.maxNodes
  }) : null;
  return performEditorCommandInstallation({
    ...args, history: args.history,
    command: {
      ...command, historyEntry, baseLayout: args.baseLayout, baseRevision: args.baseRevision,
      layoutExperiment: args.layoutExperiment || null,
      layoutDiagnosticMaxNodes: args.layoutDiagnosticMaxNodes || null
    }
  });
}





