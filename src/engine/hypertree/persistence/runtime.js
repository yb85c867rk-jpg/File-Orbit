import { createAttachmentRegistry } from '../editor/attachments.js';
import { loadTree } from '../data/tree-loader.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../layout/index.js';
import { createExplorationModel } from '../exploration/navigation-model.js';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from '../editor/attachment-classification.js';
import { PersistenceError } from './schema.js';
import { resolveSavedMapNodeLimit } from './node-limit.js';

export function createRestoredAttachmentRegistry({ attachments = [], datasetToken, maxFileBytes = MAX_ATTACHMENT_BYTES, maxTotalBytes = MAX_ATTACHMENT_TOTAL_BYTES } = {}) {
  const registry = createAttachmentRegistry({ datasetToken, maxFileBytes, maxTotalBytes });
  try {
    for (const attachment of attachments) {
      const adopted = registry.adopt({
        attachmentId: attachment.attachmentId,
        file: attachment.blob,
        metadata: attachment.metadata
      });
      if (!adopted.ok) throw new PersistenceError('attachment-adoption-failed', adopted.message || 'Saved attachment could not be adopted.', { details: adopted });
    }
    return { registry, attachmentIds: new Map(attachments.map((attachment) => [attachment.attachmentId, attachment.attachmentId])) };
  } catch (error) {
    registry.clear();
    throw error;
  }
}

/**
 * Reconstruct an isolated runtime candidate from a repository load result.
 * No global live map, surface, overlay, session, history, or object URL is touched.
 */
function admitRuntime({ loaded, datasetToken, viewport, maxNodes = null, policyContext = undefined }) {
  if (!loaded?.map || !loaded?.document) throw new PersistenceError('load-required', 'A loaded saved map is required.');
  if (!Number.isSafeInteger(datasetToken) || datasetToken < 0) throw new PersistenceError('dataset-invalid', 'A fresh runtime dataset token is required.');
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new PersistenceError('zero-viewport', 'The graph viewport is not measurable.');
  }
  const nodeLimit = resolveSavedMapNodeLimit(maxNodes, policyContext);
  if (!nodeLimit.ok) throw new PersistenceError(nodeLimit.reason, nodeLimit.message);
  let loadedTree;
  try { loadedTree = loadTree(loaded.document.tree); }
  catch (error) { throw new PersistenceError('runtime-reconstruction-failed', `Saved map tree is invalid: ${String(error?.message || error)}`, { cause: error }); }
  const actualNodeCount = loadedTree.graph.nodes.size;
  if (actualNodeCount !== loaded.map.nodeCount) {
    throw new PersistenceError('node-count-inconsistent', 'Saved map runtime node count is inconsistent.');
  }
  if (actualNodeCount > nodeLimit.limit) throw new PersistenceError('node-limit', 'Saved map exceeds the runtime node limit.');
  return { loadedTree, actualNodeCount, nodeLimit };
}

/**
 * Validate data admission without adopting attachments or running layout.
 * A successful result is not proof of readable rendering.
 */
export function admitSavedMapRuntime({ loaded, datasetToken, viewport, maxNodes = null, policyContext = undefined } = {}) {
  const admitted = admitRuntime({ loaded, datasetToken, viewport, maxNodes, policyContext });
  return {
    ok: true,
    mapId: loaded.map.mapId,
    generation: loaded.map.generation,
    tree: loaded.document.tree,
    graph: admitted.loadedTree.graph,
    nodeCount: admitted.actualNodeCount,
    nodeLimit: admitted.nodeLimit.limit,
    edition: admitted.nodeLimit.edition
  };
}

export function reconstructSavedMapRuntime({
  loaded,
  datasetToken,
  viewport,
  baseRadiusCss = null,
  maxNodes = null,
  policyContext = undefined
} = {}) {
  const { loadedTree, actualNodeCount, nodeLimit } = admitRuntime({ loaded, datasetToken, viewport, maxNodes, policyContext });
  let builtRegistry = null;
  try {
    const restored = createRestoredAttachmentRegistry({ attachments: loaded.attachments, datasetToken });
    builtRegistry = restored.registry;
    const staged = stageExperimentalV2Layout(loadedTree.graph, {
      rootId: loaded.document.tree.id, phases: ['current'], nodeOptions: { overridable: true }
    });
    const radius = baseRadiusCss ?? Math.max(1, Math.min(viewport.width, viewport.height) * 0.42);
    const refined = refineExperimentalV2Layout(staged, loadedTree.graph, {
      viewport, padding: 24, phase: 'current', projectionBaseRadiusCss: radius, diagnosticMaxNodes: nodeLimit.limit
    });
    const baseLayout = refined.staged;
    const model = createExplorationModel({
      graph: loadedTree.graph,
      baseLayout,
      structuralRootId: loaded.document.tree.id,
      phase: 'current'
    });
    return {
      ok: true,
      mapId: loaded.map.mapId,
      generation: loaded.map.generation,
      savedRevision: 0,
      datasetToken,
      tree: loaded.document.tree,
      graph: loadedTree.graph,
      baseLayout,
      model,
      registry: builtRegistry,
      attachmentIds: restored.attachmentIds,
      attachmentBytes: loaded.map.attachmentBytes,
      nodeCount: actualNodeCount,
      dispose() { builtRegistry?.clear(); }
    };
  } catch (error) {
    builtRegistry?.clear();
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError('runtime-reconstruction-failed', `Saved map could not be reconstructed: ${String(error?.message || error)}`, { cause: error });
  }
}

export async function loadSavedMapRuntime({
  repository,
  mapId,
  datasetToken,
  viewport,
  baseRadiusCss = null,
  maxNodes = null,
  policyContext = undefined
} = {}) {
  if (!repository || typeof repository.load !== 'function') throw new PersistenceError('repository-required', 'A persistence repository is required.');
  const loaded = await repository.load(mapId);
  return reconstructSavedMapRuntime({ loaded, datasetToken, viewport, baseRadiusCss, maxNodes, policyContext });
}

