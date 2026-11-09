export const activeDocument = { active: false, name: null, handle: null, mode: 'none', savedRevision: null, origin: null, documentIdentity: null, parentHandle: null, baseline: null };
export const activeMap = { mapId: null, generation: null, savedRevision: null };
export function resetActiveDocument() { Object.assign(activeDocument, { active: false, name: null, handle: null, mode: 'none', savedRevision: null, origin: null, documentIdentity: null, parentHandle: null, baseline: null }); }
export function adoptActiveDocument(values) { Object.assign(activeDocument, { active: false, name: null, handle: null, mode: 'none', savedRevision: null, origin: null, documentIdentity: null, parentHandle: null, baseline: null }, values); return activeDocument; }
export function clearActiveMap() { Object.assign(activeMap, { mapId: null, generation: null, savedRevision: null }); }
export function setActiveMap(values) { Object.assign(activeMap, { mapId: null, generation: null, savedRevision: null }, values); return activeMap; }
export function documentIsDirty(revision) {
  if (!activeMap.mapId) return true;
  return revision !== activeMap.savedRevision;
}
export function activeDocumentSnapshot() { return { ...activeDocument }; }
