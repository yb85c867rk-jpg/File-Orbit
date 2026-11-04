import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorContextMenu } from '../../harness/m5-exploration/editor-context-menu.js';
import { createDeleteConfirmation } from '../../harness/m5-exploration/delete-confirm.js';
import { dispatchEditorMenuAction } from '../../../src/engine/hypertree/editor/menu-dispatch.js';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, createExplorationSession, recoverAuthoritativeSession } from '../../../src/engine/hypertree/exploration/index.js';
import { prepareExplorationFrame } from '../../../src/engine/hypertree/exploration/frame.js';
import { performDeleteInstallation } from '../../../src/engine/hypertree/editor/action.js';
import { resolveDeleteTarget } from '../../../src/engine/hypertree/editor/delete-target.js';
import { createEditorHistory } from '../../../src/engine/hypertree/editor/history.js';
import { performMetadataHistoryReplay } from '../../../src/engine/hypertree/editor/history-replay.js';
import { resetCamera, EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = new Map(); this.hidden = false; this._text = ''; this.listeners = new Map(); this.parentNode = null; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { for (const child of children) this.appendChild(child); }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  fire(type) { for (const handler of this.listeners.get(type) || []) handler({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }); }
  focus() { this.ownerDocument.activeElement = this; this.focused = true; }
  contains(target) { return target === this || this.children.includes(target); }
  getBoundingClientRect() { return { width: 140, height: 200 }; }
}
function fakeDocument() {
  const document = { activeElement: null, body: new El('body'), listeners: [], createElement(tag) { const el = new El(tag); el.ownerDocument = document; return el; }, addEventListener(type, handler) { document.listeners.push({ type, handler }); } };
  return document;
}
function setup() {
  const tree = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [
    { id: 'a', name: 'Alpha', kind: 'folder', data: {}, children: [{ id: 'x', name: 'Data', kind: 'file', data: { dataType: 'web-link', description: 'd', link: 'https://x' } }] },
    { id: 'b', name: 'Beta', kind: 'folder', data: {}, children: [] }
  ] };
  const viewport = { width: 900, height: 500 };
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, phase: 'current', projectionBaseRadiusCss: 198.66 }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  model.select('x');
  const live = { tree, graph, baseLayout, model, session: null };
  let frames = 0; let fail = false; let revision = 0; let detailsTargetId = 'x'; let candidateEnv = null; let lastFrame = null;
  const frame = (args) => {
    if (fail) throw new Error('frame exploded');
    const env = candidateEnv || live;
    const prepared = prepareExplorationFrame({ graph: env.graph, baseLayout: env.baseLayout, view: args.entry?.view || env.model.view(), viewport, baseRadiusCss: 198.66, fit: args.fit, camera: args.camera, framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: new Map() });
    lastFrame = prepared; frames += 1;
    return { camera: prepared.camera, framing: args.framing, scene: prepared.scene, filtered: prepared.filtered, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({ model, frame, invalidate: () => {}, publish: () => {}, initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS });
  live.session = session;
  session.run('initial-overview', () => ({ ok: true, fit: true }), { fit: false, eventKind: 'programmatic' });
  const history = createEditorHistory();
  const commit = (candidate, candidateSession) => { live.tree = candidate.tree; live.graph = candidate.graph; live.baseLayout = candidate.baseLayout; live.model = candidate.model; live.session = candidateSession; revision += 1; };
  const common = () => ({ tree: live.tree, graph: live.graph, baseLayout: live.baseLayout, model: live.model, session: live.session, datasetToken: 1, baseRevision: revision, expectedDatasetToken: 1, expectedRevision: revision, structuralRootId: 'r', viewport, baseRadiusCss: 198.66, frame, invalidate: () => {}, setCandidateEnv: (env) => { candidateEnv = env; }, commit, recover: () => recoverAuthoritativeSession(live.session) });
  const view = () => ({ focusedFolderId: live.model.focusedFolderId, selectedId: live.model.selectedId, detailsTargetId, camera: { ...live.session.getState().camera }, framing: live.session.getState().framing, viewport });
  const deleteNode = (targetId) => performDeleteInstallation({ ...common(), targetId, history, historyViewBefore: view(), historyViewAfter: { ...view(), detailsTargetId: 'r' } });
  const replay = (direction) => performMetadataHistoryReplay({ direction, history, tree: live.tree, datasetToken: 1, attachmentRegistry: { get: () => null }, ...common() });
  return { live, history, deleteNode, replay, view, get lastFrame() { return lastFrame; }, get frames() { return frames; }, get revision() { return revision; }, setFail: (v) => { fail = v; }, setDetails: (id) => { detailsTargetId = id; } };
}
function createFlow() {
  const doc = fakeDocument(); const s = setup(); let confirmOpen = 0; let deleteResult = null;
  const confirmation = createDeleteConfirmation({ document: doc, host: doc.body, onConfirm: (value) => { deleteResult = s.deleteNode(value.target.id); } });
  const requestDelete = (target, action) => {
    const resolved = resolveDeleteTarget({ tree: s.live.tree, target, action, structuralRootId: 'r' });
    if (!resolved.ok) return resolved;
    confirmOpen += 1;
    confirmation.open({ target: { id: resolved.found.node.id, name: resolved.found.node.name, kind: resolved.found.node.kind }, folders: resolved.counts.folders, files: resolved.counts.files, datasetToken: 1, baseRevision: s.revision, parentId: resolved.parentId });
    return { ok: true };
  };
  const menu = createEditorContextMenu({ document: doc, host: doc.body, viewport: () => ({ width: 900, height: 500 }), onAction: (target, action) => dispatchEditorMenuAction({ action, target, requestDelete, dispatchEditor: () => { throw new Error('editor flow must not run'); } }) });
  return { doc, s, confirmation, menu, get confirms() { return confirmOpen; }, get deleteResult() { return deleteResult; } };
}
function click(el) { el.fire('click'); }
test('real menu Delete opens real confirmation; Confirm runs shared installer and Undo/Redo', () => {
  const f = createFlow();
  f.menu.open({ target: { id: 'a', hitKind: 'folder', name: 'Alpha', isRoot: false }, x: 20, y: 20 });
  click(f.menu.actions.get('delete-folder'));
  assert.equal(f.confirmation.isOpen, true);
  assert.equal(f.s.live.tree.children.some((node) => node.id === 'a'), true);
  const dialog = f.confirmation.element.children[0];
  const confirm = dialog.children[4].children[1];
  click(confirm);
  assert.equal(f.confirmation.isOpen, false);
  assert.equal(f.s.live.tree.children.some((node) => node.id === 'a'), false);
  assert.equal(f.s.history.undoCount, 1);
  assert.equal(f.s.replay('undo').ok, true);
  assert.equal(f.s.live.tree.children[0].id, 'a');
  assert.equal(f.s.replay('redo').ok, true);
  assert.equal(f.s.live.tree.children.some((node) => node.id === 'a'), false);
});
test('Cancel and Escape never call delete installer', () => {
  const f = createFlow();
  f.menu.open({ target: { id: 'a', hitKind: 'folder', name: 'Alpha', isRoot: false }, x: 20, y: 20 });
  click(f.menu.actions.get('delete-folder'));
  const dialog = f.confirmation.element.children[0];
  click(dialog.children[4].children[0]);
  assert.equal(f.s.live.tree.children.some((node) => node.id === 'a'), true);
  f.menu.open({ target: { id: 'a', hitKind: 'folder', name: 'Alpha', isRoot: false }, x: 20, y: 20 });
  click(f.menu.actions.get('delete-folder'));
  const key = f.doc.listeners.filter((entry) => entry.type === 'keydown').at(-1);
  key.handler({ key: 'Escape', preventDefault() {} });
  assert.equal(f.s.live.tree.children.some((node) => node.id === 'a'), true);
  assert.equal(f.s.history.undoCount, 0);
});
test('explicit right-click target differs from selection; failure preserves tree/history', () => {
  const f = createFlow();
  f.s.live.model.select('x');
  f.s.setDetails('x');
  f.menu.open({ target: { id: 'b', hitKind: 'folder', name: 'Beta', isRoot: false }, x: 20, y: 20 });
  click(f.menu.actions.get('delete-folder'));
  f.s.setFail(true);
  const dialog = f.confirmation.element.children[0];
  click(dialog.children[4].children[1]);
  assert.equal(f.s.live.tree.children.some((node) => node.id === 'b'), true);
  assert.equal(f.s.history.undoCount, 0);
});test('data menu Delete → real confirmation → installer → Undo → Redo', () => {
  const f = createFlow();
  f.menu.open({ target: { id: 'x', hitKind: 'file', name: 'Data', isRoot: false }, x: 20, y: 20 });
  click(f.menu.actions.get('delete-data'));
  assert.equal(f.confirmation.isOpen, true);
  const dialog = f.confirmation.element.children[0];
  click(dialog.children[4].children[1]);
  assert.equal(f.deleteResult?.ok, true, JSON.stringify(f.deleteResult));
  assert.equal(f.s.live.tree.children[0].children.some((node) => node.id === 'x'), false);
  assert.equal(f.s.lastFrame.scene.nodes.has('x'), false);
  f.s.replay('undo');
  assert.equal(f.s.live.tree.children[0].children.some((node) => node.id === 'x'), true);
  assert.equal(f.s.lastFrame.scene.nodes.has('x'), true);
  f.s.replay('redo');
  assert.equal(f.s.live.tree.children[0].children.some((node) => node.id === 'x'), false);
});




