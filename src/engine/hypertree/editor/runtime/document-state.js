import { countTreeNodes } from '../validation.js';

export function loadedFor(current, tree, attachments = current.attachments) {
  const nodeCount = countTreeNodes(tree);
  const attachmentBytes = (attachments || []).reduce((sum, a) => sum + (a.blob?.size || 0), 0);
  return { map: { ...current.map, nodeCount, attachmentBytes }, document: { ...current.document, tree, nodeCount }, attachments };
}
export function documentIdentity(loaded) { return { mapId: loaded?.map?.mapId, generation: loaded?.map?.generation, datasetToken: loaded?.map?.datasetToken }; }
