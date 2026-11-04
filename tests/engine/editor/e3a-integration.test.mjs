import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, recoverAuthoritativeSession, stageExplorationFrame, buildReparentCandidate, performReparentInstallation } from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { performEditFolderInstallation, performEditDataInstallation, performAddChildInstallation, performDeleteInstallation } from '../../../src/engine/hypertree/editor/action.js';
import { createEditorHistory } from '../../../src/engine/hypertree/editor/history.js';
import { createEditorIdAllocator } from '../../../src/engine/hypertree/editor/validation.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
import { performMetadataHistoryReplay } from '../../../src/engine/hypertree/editor/history-replay.js';
import { makeReparentHistoryEntry } from '../../../src/engine/hypertree/editor/history-commands.js';
import { resolvePostOperationDetails } from '../../../src/engine/hypertree/editor/details-policy.js';

const viewport = { width: 1100, height: 473 };
function node(id, kind, name, children, data = {}) {
  return { id, name, kind, data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }, data), ...(children ? { children } : {}) };
}
function setup() {
  const source = node('r', 'folder', 'Root', [
    node('a', 'folder', 'Alpha', [node('x', 'file', 'Data', null, { dataType: 'web-link', description: 'old', link: 'https://old.example/a' })])
  ]);
  const { graph } = loadTree(source);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  model.select('x');
  const live = { tree: source, graph, baseLayout, model, session: null };
  let candidateEnv = null;
  let frames = 0;
  let failDraw = false;
  let revision = 0;
  let detailsTargetId = 'x';
  let pendingOperation = null;
  let pendingParentId = null;
  let pendingSourceId = null;
  const frame = (args) => {
    const env = candidateEnv || live;
    const prepared = stageExplorationFrame({
      graph: env.graph, baseLayout: env.baseLayout, view: env.model.view(), viewport,
      baseRadiusCss: 198.66, fit: args.fit, entry: args.entry, camera: args.camera, framing: args.framing,
      cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: new Map(),
      adapters: {
        draw: () => { if (failDraw && candidateEnv) throw new Error('draw failed'); },
        labels: () => {}, installHit: () => {}
      }
    });
    if (candidateEnv && !failDraw) frames += 1;
    return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({
    model, frame, invalidate: () => {}, publish: () => {}, initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  live.session = session;
  const commit = (candidate, candidateSession) => {
    live.tree = candidate.tree; live.graph = candidate.graph; live.baseLayout = candidate.baseLayout;
    live.model = candidate.model; live.session = candidateSession; revision += 1;
    if (pendingOperation) {
      detailsTargetId = resolvePostOperationDetails({ operation: pendingOperation, currentDetailsTargetId: detailsTargetId, parentId: pendingParentId, sourceId: pendingSourceId, model: candidate.model, graph: candidate.graph });
      pendingOperation = null; pendingParentId = null; pendingSourceId = null;
    }
  };
  const history = createEditorHistory();
  const allocator = createEditorIdAllocator({ datasetToken: 1 });
  const attachments = createAttachmentRegistry({ datasetToken: 1 });
  const view = () => ({ focusedFolderId: live.model.focusedFolderId, selectedId: live.model.selectedId, detailsTargetId, camera: { ...live.session.getState().camera }, framing: live.session.getState().framing, viewport });
  const common = () => ({
    tree: live.tree, graph: live.graph, baseLayout: live.baseLayout, model: live.model, session: live.session,
    datasetToken: 1, baseRevision: revision, expectedDatasetToken: 1, expectedRevision: revision,
    structuralRootId: 'r', viewport, baseRadiusCss: 198.66, frame,
    setCandidateEnv: (env) => { candidateEnv = env; }, commit,
    recover: () => recoverAuthoritativeSession(live.session)
  });
  const editFolder = (name, description, views = null) => performEditFolderInstallation({
    ...common(), targetId: 'a', draftName: name, draftDescription: description,
    history, historyViewBefore: views?.before ?? view(), historyViewAfter: views?.after ?? { ...view(), detailsTargetId: 'a' }
  });
  const editData = (name, description, link, linkProvided = true) => performEditDataInstallation({
    ...common(), targetId: 'x', draftName: name, description, link, linkProvided,
    history, historyViewBefore: view(), historyViewAfter: { ...view(), detailsTargetId: 'x' }
  });
  const addFolder = (name) => { pendingOperation = 'add-folder'; pendingParentId = 'a'; return performAddChildInstallation({
    ...common(), parentId: 'a', kind: 'folder', draftName: name, allocator,
    history, historyViewBefore: view(), historyViewAfter: { ...view(), detailsTargetId: 'a' }
  }); };
  const moveNode = (sourceId, targetId) => { pendingOperation = 'reparent'; pendingSourceId = sourceId;
    const move = buildReparentCandidate({ tree: live.tree, sourceId, targetId, structuralRootId: 'r' });
    const entry = move.ok ? makeReparentHistoryEntry({ tree: live.tree, candidateTree: move.candidateTree, sourceId, structuralRootId: 'r', datasetToken: 1, viewBefore: view(), viewAfter: { ...view(), detailsTargetId: null } }) : null;
    return performReparentInstallation({
      ...common(), sourceId, targetId, gesture: { sourceId, generation: 1, datasetToken: 1, structuralRootId: 'r' }, generation: 1,
      history, historyEntry: entry, currentDetailsTargetId: detailsTargetId
    });
  };
  const addFile = (name) => { pendingOperation = 'add-data'; pendingParentId = 'a';
    const staged = attachments.stage({ name: name + '.md', size: 7, type: 'text/markdown' }, { format: 'markdown' });
    if (!staged.ok) return staged;
    const result = performAddChildInstallation({
      ...common(), parentId: 'a', kind: 'file', draftName: name, draftDescription: 'Doc description', draftDataType: 'file', draftAttachment: staged.metadata, allocator,
      history, historyViewBefore: view(), historyViewAfter: { ...view(), detailsTargetId: 'a' }
    });
    if (result.ok) attachments.commit(staged.id); else attachments.release(staged.id);
    return { ...result, attachmentId: staged.id };
  };
  const deleteNode = (targetId) => { pendingOperation = 'delete-folder'; pendingParentId = 'r'; return performDeleteInstallation({
    ...common(), targetId, datasetToken: 1, expectedDatasetToken: 1,
    baseRevision: revision, expectedRevision: revision,
    history, historyViewBefore: view(), historyViewAfter: { ...view(), detailsTargetId: 'r' }
  });
  };
  const replay = (direction) => performMetadataHistoryReplay({
    direction, history, tree: live.tree, datasetToken: 1, attachmentRegistry: attachments, ...common()
  });
  return { live, history, attachments, deleteNode, get detailsTargetId() { return detailsTargetId; }, setDetails(value) { detailsTargetId = value; }, editFolder, editData, addFolder, addFile, moveNode, replay, get frames() { return frames; }, get revision() { return revision; }, setFail: (value) => { failDraw = value; } };
}
test('actual Edit Folder wrapper records history and replays through shared action', () => {
  const s = setup();
  const saved = s.editFolder('Beta', 'body');
  assert.equal(saved.ok, true);
  assert.equal(saved.historyCommitted, true);
  assert.equal(s.history.undoCount, 1);
  assert.equal(s.live.tree.children[0].name, 'Beta');
  const beforeRevision = s.revision;
  const undo = s.replay('undo');
  assert.equal(undo.ok, true);
  assert.equal(s.live.tree.children[0].name, 'Alpha');
  assert.equal(s.live.tree.children[0].data.description, undefined);
  assert.equal(s.revision, beforeRevision + 1);
  assert.equal(s.history.undoCount, 0);
  assert.equal(s.history.redoCount, 1);
  const redo = s.replay('redo');
  assert.equal(redo.ok, true);
  assert.equal(s.live.tree.children[0].name, 'Beta');
  assert.equal(s.live.tree.children[0].data.description, 'body');
  assert.equal(s.history.undoCount, 1);
  assert.equal(s.history.redoCount, 0);
});
test('actual Edit Data wrapper records web-link history and preserves attachment metadata', () => {
  const s = setup();
  const staged = s.attachments.stage({ name: 'A.md', size: 3, type: 'text/markdown' }, { format: 'markdown' });
  s.attachments.commit(staged.id);
  s.live.tree.children[0].children[0].data = { dataType: 'file', description: 'old', attachmentId: staged.id, originalName: 'A.md', sizeBytes: 3, classification: { format: 'markdown' } };
  const saved = s.editData('Renamed', 'new', null, false);
  assert.equal(saved.ok, true);
  assert.equal(s.history.undoCount, 1);
  assert.equal(s.live.tree.children[0].children[0].data.attachmentId, staged.id);
  s.replay('undo');
  assert.equal(s.live.tree.children[0].children[0].name, 'Data');
  assert.equal(s.live.tree.children[0].children[0].data.attachmentId, staged.id);
  assert.equal(s.live.tree.children[0].children[0].data.classification.format, 'markdown');
});
test('failed frame and over-cap reservation preserve history', () => {
  const s = setup();
  s.editFolder('Beta', 'body');
  assert.equal(s.history.undoCount, 1);
  s.setFail(true);
  const failed = s.editFolder('Gamma', 'body2');
  assert.equal(failed.ok, false);
  assert.equal(s.history.undoCount, 1);
  assert.equal(s.live.tree.children[0].name, 'Beta');
  s.setFail(false);
  const tiny = createEditorHistory({ maxEntryBytes: 10 });
  const original = s.history;
  const result = performEditFolderInstallation({
    ...s.live, targetId: 'a', draftName: 'Nope', draftDescription: 'x',
    datasetToken: 1, baseRevision: s.revision, expectedDatasetToken: 1, expectedRevision: s.revision,
    structuralRootId: 'r', viewport, baseRadiusCss: 198.66, frame: () => { throw new Error('must not frame'); },
    setCandidateEnv: () => {}, commit: () => { throw new Error('must not commit'); },
    recover: () => false, history: tiny,
    historyViewBefore: { selectedId: null, detailsTargetId: null }, historyViewAfter: { selectedId: null, detailsTargetId: null }
  });
  assert.equal(result.reason, 'history-entry-limit');
  assert.equal(original.undoCount, 1);
});test('actual Edit Data wrapper records Web-link history and replays URL', () => {
  const s = setup();
  const saved = s.editData('Renamed Web', 'new', 'https://new.example/a');
  assert.equal(saved.ok, true);
  assert.equal(s.history.undoCount, 1);
  assert.equal(s.live.tree.children[0].children[0].data.link, 'https://new.example/a');
  s.replay('undo');
  assert.equal(s.live.tree.children[0].children[0].data.link, 'https://old.example/a');
  s.replay('redo');
  assert.equal(s.live.tree.children[0].children[0].data.link, 'https://new.example/a');
});test('explicit null selection view is restored instead of falling back to current selection', () => {
  const s = setup();
  const manual = { focusedFolderId: 'r', selectedId: null, detailsTargetId: null, camera: { zoom: 1.75, panX: 17, panY: -11 }, framing: 'manual', viewport };
  const saved = s.editFolder('Beta', 'body', { before: manual, after: { ...manual, selectedId: 'x' } });
  assert.equal(saved.ok, true);
  assert.equal(s.live.model.selectedId, 'x');
  s.replay('undo');
  assert.equal(s.live.model.selectedId, null);
  assert.deepEqual(s.live.session.getState().camera, manual.camera);
  s.replay('redo');
  assert.equal(s.live.model.selectedId, 'x');
});test('actual Add Folder wrapper records stable-ID history and undo/redo restores position', () => {
  const s = setup();
  const saved = s.addFolder('Added');
  assert.equal(saved.ok, true);
  assert.equal(saved.historyCommitted, true);
  assert.equal(s.history.undoCount, 1);
  const added = s.live.tree.children[0].children.find((node) => node.name === 'Added');
  assert.ok(added);
  const id = added.id;
  s.replay('undo');
  assert.equal(s.live.tree.children[0].children.some((node) => node.id === id), false);
  assert.equal(s.history.redoCount, 1);
  s.replay('redo');
  assert.ok(s.live.tree.children[0].children.some((node) => node.id === id));
  assert.equal(s.history.undoCount, 1);
});test('actual reparent action records history and restores exact parent/index', () => {
  const s = setup();
  const beforeIndex = s.live.tree.children[0].children.findIndex((node) => node.id === 'x');
  const saved = s.moveNode('x', 'r');
  assert.equal(saved.ok, true);
  assert.equal(s.history.undoCount, 1);
  assert.ok(s.live.tree.children.some((node) => node.id === 'x'));
  s.replay('undo');
  assert.equal(s.live.tree.children[0].children[beforeIndex].id, 'x');
  s.replay('redo');
  assert.ok(s.live.tree.children.some((node) => node.id === 'x'));
});test('actual Add File wrapper retains attachment across Undo and restores same reference on Redo', () => {
  const s = setup();
  const saved = s.addFile('Doc');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(s.history.undoCount, 1);
  assert.equal(s.history.undo.at(-1).attachmentRefs.includes(saved.attachmentId), true);
  assert.equal(s.attachments.has(saved.attachmentId), true);
  s.replay('undo');
  assert.equal(s.live.tree.children[0].children.some((node) => node.name === 'Doc'), false);
  assert.equal(s.attachments.has(saved.attachmentId), true);
  s.replay('redo');
  const restored = s.live.tree.children[0].children.find((node) => node.name === 'Doc');
  assert.equal(restored.data.attachmentId, saved.attachmentId);
});test('missing retained attachment rejects redo before frame/stack/registry mutation', () => {
  const s = setup();
  const saved = s.addFile('Doc');
  s.replay('undo');
  const framesBefore = s.frames;
  const undoBefore = s.history.undoCount;
  const redoBefore = s.history.redoCount;
  s.attachments.release(saved.attachmentId);
  const result = s.replay('redo');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'attachment-missing');
  assert.equal(s.frames, framesBefore);
  assert.equal(s.history.undoCount, undoBefore);
  assert.equal(s.history.redoCount, redoBefore);
  assert.equal(s.attachments.has(saved.attachmentId), false);
});test('reparent preserves explicit null details instead of opening moved node', () => {
  const s = setup();
  s.setDetails(null);
  const saved = s.moveNode('x', 'r');
  assert.equal(saved.ok, true);
  assert.equal(s.detailsTargetId, null);
  const entry = s.history.undo.at(-1);
  assert.equal(entry.viewAfter.detailsTargetId, null);
  s.replay('undo');
  assert.equal(s.detailsTargetId, null);
  s.replay('redo');
  assert.equal(s.detailsTargetId, null);
});
test('mixed edit/add/move undo three times and redo three times', () => {
  const s = setup();
  s.editFolder('Edited', 'edited body');
  s.addFolder('Added');
  s.moveNode('x', 'r');
  assert.equal(s.history.undoCount, 3);
  const finalTree = JSON.stringify(s.live.tree);
  s.replay('undo');
  s.replay('undo');
  s.replay('undo');
  assert.equal(s.history.undoCount, 0);
  assert.equal(s.history.redoCount, 3);
  assert.equal(s.live.tree.children[0].name, 'Alpha');
  s.replay('redo');
  s.replay('redo');
  s.replay('redo');
  assert.equal(s.history.undoCount, 3);
  assert.equal(s.history.redoCount, 0);
  assert.equal(JSON.stringify(s.live.tree), finalTree);
});test('actual Delete installation removes a folder subtree and Undo/Redo restores exact IDs', () => {
  const s = setup();
  const original = JSON.stringify(s.live.tree);
  const saved = s.deleteNode('a');
  assert.equal(saved.ok, true);
  assert.equal(saved.historyCommitted, true);
  assert.equal(s.live.tree.children.some((node) => node.id === 'a'), false);
  assert.equal(s.history.undoCount, 1);
  s.replay('undo');
  assert.equal(JSON.stringify(s.live.tree), original);
  s.replay('redo');
  assert.equal(s.live.tree.children.some((node) => node.id === 'a'), false);
});
test('Delete File retains attachment through Undo and restores same reference', () => {
  const s = setup();
  const added = s.addFile('Doc');
  assert.equal(added.ok, true);
  const file = s.live.tree.children[0].children.find((node) => node.name === 'Doc');
  const saved = s.deleteNode(file.id);
  assert.equal(saved.ok, true);
  assert.equal(s.attachments.has(added.attachmentId), true);
  s.replay('undo');
  const restored = s.live.tree.children[0].children.find((node) => node.id === file.id);
  assert.equal(restored.data.attachmentId, added.attachmentId);
  assert.equal(s.attachments.has(added.attachmentId), true);
});
test('structural root deletion rejects directly without mutation', () => {
  const s = setup();
  const original = JSON.stringify(s.live.tree);
  const result = s.deleteNode('r');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'root-protected');
  assert.equal(JSON.stringify(s.live.tree), original);
  assert.equal(s.history.undoCount, 0);
});test('deleting focused/selected/details subtree applies parent fallback in commit and history', () => {
  const s = setup();
  s.live.model.enterFolder('a');
  s.live.model.select('x');
  s.setDetails('x');
  const saved = s.deleteNode('a');
  assert.equal(saved.ok, true);
  assert.equal(s.live.model.focusedFolderId, 'r');
  assert.equal(s.live.model.selectedId, null);
  assert.equal(s.detailsTargetId, 'r');
  const entry = s.history.undo.at(-1);
  assert.equal(entry.viewAfter.detailsTargetId, 'r');
  s.replay('undo');
  assert.equal(s.live.model.focusedFolderId, 'a');
});


