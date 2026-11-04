import { admitSavedMapRuntime, createRestoredAttachmentRegistry } from '../persistence/runtime.js';
import { LodPresentationModel } from './presentation-model.js';
import { createLodRenderAdapter } from './render-adapter.js';
import { sweepAttachmentOwnership } from '../editor/attachments.js';

/**
 * Isolated bridge: repository-loaded document -> Stage 3C admission -> Stage 2B-2 LOD model.
 * No live map/session/history/editor state is touched.
 */
export function createSavedDocumentLodBridge({
  loaded,
  datasetToken,
  viewport,
  policyContext = undefined,
  maxNodes = null,
  host = null,
  width = 1200,
  height = 700,
  clusterSize = 40,
  clusterPageSize = 8,
  searchPageSize = 50
} = {}) {
  // Admission must happen before attachment adoption or presentation setup.
  const admitted = admitSavedMapRuntime({ loaded, datasetToken, viewport, policyContext, maxNodes });
  let restored = null;
  let model = null;
  let adapter = null;
  try {
    restored = createRestoredAttachmentRegistry({ attachments: loaded.attachments, datasetToken });
    model = new LodPresentationModel(loaded.document.tree, { clusterSize, clusterPageSize, searchPageSize });
    adapter = host ? createLodRenderAdapter({ host, width, height }) : null;
  } catch (error) {
    try { adapter?.dispose(); } catch {}
    try { restored?.registry.clear(); } catch {}
    throw error;
  }
  const previewUrls = new Map();
  let disposed = false;
  let renderResult = null;

  function assertLive() { if (disposed) throw new Error('Stage 3D bridge is disposed'); }
  function render() {
    assertLive();
    if (!adapter) return null;
    renderResult = adapter.render(model);
    return renderResult;
  }
  function scene() { assertLive(); return model.buildScene(); }
  function openFolder(id) { assertLive(); const result = model.navigateToFolder(id); if (adapter) render(); return result; }
  function expandCluster(id) { assertLive(); const result = model.expandCluster(id); if (adapter) render(); return result; }
  function breadcrumb() { assertLive(); return model.breadcrumb(); }
  function back() { assertLive(); const result = model.back(); if (adapter) render(); return result; }
  function overview() { assertLive(); const result = model.overview(); if (adapter) render(); return result; }
  function clusterPage(page) { assertLive(); const result = model.setClusterPage(page); if (adapter) render(); return result; }
  function clusterNext() { assertLive(); return clusterPage((model.state.clusterPage || 1) + 1); }
  function clusterPrev() { assertLive(); return clusterPage((model.state.clusterPage || 1) - 1); }
  function pageNext() { assertLive(); const scene = model.buildScene(); const result = scene.mode === 'cluster' ? model.setClusterPage((scene.page || 1) + 1) : model.setFolderPage((scene.page || 1) + 1); if (adapter) render(); return result; }
  function pagePrev() { assertLive(); const scene = model.buildScene(); const result = scene.mode === 'cluster' ? model.setClusterPage((scene.page || 1) - 1) : model.setFolderPage((scene.page || 1) - 1); if (adapter) render(); return result; }
  function search(query, page = 1) {
    assertLive();
    const result = model.search(query, page);
    if (adapter) render();
    return result;
  }
  function revealSearchResult(id) { assertLive(); const result = model.revealSearchResult(id); if (adapter) render(); return result; }
  function select(id) { assertLive(); const result = model.select(id); if (adapter) render(); return result; }
  function details() { assertLive(); return model.details(); }
  function preview(id) {
    assertLive();
    const record = model.documentRecord(id);
    if (!record || record.node.kind !== 'file' || !record.node.data?.attachmentId) return null;
    const attachmentId = record.node.data.attachmentId;
    if (!restored.registry.get(attachmentId)) return null;
    if (!previewUrls.has(attachmentId)) {
      const file = restored.registry.get(attachmentId).file;
      previewUrls.set(attachmentId, URL.createObjectURL(file));
    }
    return { attachmentId, url: previewUrls.get(attachmentId), name: record.node.data.originalName || record.node.name };
  }
  function context() { assertLive(); return model.context(); }
  function sweepAttachments({ tree = loaded.document.tree, entries = [] } = {}) { assertLive(); return sweepAttachmentOwnership(restored.registry, { tree, entries }); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    try { adapter?.dispose(); } finally {
      for (const url of previewUrls.values()) URL.revokeObjectURL(url);
      previewUrls.clear();
      restored.registry.clear();
    }
  }

  return {
    admitted, model, adapter, tree: loaded.document.tree, graph: admitted.graph,
    mapId: loaded.map.mapId, generation: loaded.map.generation,
    nodeCount: admitted.nodeCount, documentIds: model.documentIdsList(),
    proxyIds: model.proxyIdsList(), scene, render, openFolder, expandCluster, breadcrumb,
    back, overview, clusterPage, clusterNext, clusterPrev, pageNext, pagePrev, search, revealSearchResult, select, details, preview, context, sweepAttachments, dispose,
    get renderResult() { return renderResult; }
  };
}



