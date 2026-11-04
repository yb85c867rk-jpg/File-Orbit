import test from 'node:test'; import assert from 'node:assert/strict';
import { activeDocument, activeMap, adoptActiveDocument, clearActiveMap, documentIsDirty, setActiveMap, resetActiveDocument } from '../../../src/app/pc/document-ownership.js';
test('Stage 3J-1 document ownership is one stable extracted state boundary', () => {
  const documentRef = activeDocument; const mapRef = activeMap;
  resetActiveDocument(); clearActiveMap(); assert.equal(activeDocument, documentRef); assert.equal(activeMap, mapRef); assert.equal(activeDocument.active, false); assert.equal(activeMap.mapId, null); assert.equal(documentIsDirty(0), true);
  setActiveMap({ mapId: 'map_a', generation: 1, savedRevision: 0 }); assert.equal(documentIsDirty(0), false); assert.equal(documentIsDirty(1), true);
  adoptActiveDocument({ active: true, name: 'A.orbit', handle: { name: 'A.orbit' }, mode: 'writable', savedRevision: 0, origin: 'orbit', documentIdentity: 'doc-a', baseline: { state: 'known' } });
  assert.equal(activeDocument, documentRef); assert.equal(activeDocument.name, 'A.orbit'); assert.equal(activeDocument.origin, 'orbit');
  adoptActiveDocument({ active: true, name: 'B.orbit', handle: { name: 'B.orbit' }, mode: 'writable', savedRevision: 0, origin: 'orbit', documentIdentity: 'doc-b', baseline: { state: 'known' } });
  assert.equal(activeDocument, documentRef); assert.equal(activeDocument.name, 'B.orbit'); assert.equal(activeDocument.documentIdentity, 'doc-b');
  resetActiveDocument(); clearActiveMap(); assert.equal(activeDocument.active, false); assert.equal(activeMap.mapId, null);
});
