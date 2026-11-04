function visible(model, id) { return Boolean(id) && model?.view?.().visibleSet?.has(id) === true; }
export function resolvePostOperationDetails({ operation, currentDetailsTargetId = null, parentId = null, sourceId = null, targetId = null, deletedIds = null, model, graph }) {
  if (operation === 'delete-folder' || operation === 'delete-data') {
    if (currentDetailsTargetId === null) return null;
    if (currentDetailsTargetId && !deletedIds?.has?.(currentDetailsTargetId) && graph?.nodes?.has(currentDetailsTargetId) && visible(model, currentDetailsTargetId)) return currentDetailsTargetId;
    if (parentId && graph?.nodes?.has(parentId) && visible(model, parentId)) return parentId;
    return null;
  }
  if (operation === 'add-folder' || operation === 'add-data') {
    if (visible(model, model?.selectedId)) return model.selectedId;
    if (visible(model, parentId)) return parentId;
    return null;
  }
  if (operation === 'reparent') {
    if (currentDetailsTargetId === null) return null;
    if (currentDetailsTargetId && graph?.nodes?.has(currentDetailsTargetId) && visible(model, currentDetailsTargetId)) return currentDetailsTargetId;
    if (visible(model, sourceId)) return sourceId;
    if (visible(model, model?.focusedFolderId)) return model.focusedFolderId;
    return null;
  }
  if (targetId && graph?.nodes?.has(targetId)) return targetId;
  return null;
}







