export function viewOf(model) {
  const scene = model.buildScene();
  return { focusedFolderId: model.state.folderId, folderPage: model.state.folderPage, expandedClusterId: model.state.expandedClusterId, clusterPage: model.state.clusterPage, selectedId: model.state.selectedId, searchTargetId: model.state.searchTargetId, query: model.state.query, page: scene.page, pages: scene.pages };
}
export function applyView(model, view, documentTree) {
  if (!view) return;
  const rootId = documentTree.id;
  const folderId = model.documentRecord(view.focusedFolderId)?.node.kind === 'folder' ? view.focusedFolderId : rootId;
  model.state.folderId = folderId;
  const folder = model.documentRecord(folderId).node;
  const cluster = view.expandedClusterId ? model.proxyRecord(view.expandedClusterId) : null;
  model.state.expandedClusterId = cluster && cluster.parentId === folderId && (folder.children || []).length > (model.clusterSize || 40) ? cluster.id : null;
  model.state.folderPage = Number.isSafeInteger(view.folderPage) ? view.folderPage : 1;
  model.state.clusterPage = Number.isSafeInteger(view.clusterPage) ? view.clusterPage : 1;
  model.state.selectedId = model.documentRecord(view.selectedId) ? view.selectedId : null;
  model.state.searchTargetId = model.documentRecord(view.searchTargetId) ? view.searchTargetId : null;
  model.state.query = view.query || ''; model.state.searchPage = 1;
  let scene;
  try { scene = model.buildScene(); }
  catch { model.state.folderId = rootId; model.state.expandedClusterId = null; model.state.folderPage = 1; model.state.clusterPage = 1; scene = model.buildScene(); }
  if (model.state.expandedClusterId && !scene.items.length) model.state.expandedClusterId = null;
  if (model.state.selectedId && !scene.items.some((item) => item.id === model.state.selectedId)) model.state.selectedId = null;
  if (model.state.searchTargetId && !scene.items.some((item) => item.id === model.state.searchTargetId)) model.state.searchTargetId = null;
  model.buildScene();
}
