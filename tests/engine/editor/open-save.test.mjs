import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createExplorationModel, createExplorationSession, handleExplorationCanvasClick, recoverAuthoritativeSession, stageExplorationFrame
} from '../../../src/engine/hypertree/exploration/index.js';
import { performRenameInstallation } from '../../../src/engine/hypertree/editor/action.js';
import { createEditorController } from '../../../src/engine/hypertree/editor/controller.js';
import { EXPERIMENTAL_CAMERA_LIMITS, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { createEditorPanel } from '../../harness/m5-exploration/editor-panel.js';
import { createEditorContextMenu } from '../../harness/m5-exploration/editor-context-menu.js';
import { createEditorTarget } from '../../../src/engine/hypertree/editor/target.js';
import { chooseEditorTarget as chooseEditorTargetFlow, resumeEditorTarget } from '../../../src/engine/hypertree/editor/activation-flow.js';
import { resolveEditorTarget } from '../../../src/engine/hypertree/editor/activation.js';

class FakeElement extends EventTarget {
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; this.children = []; this.style = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.readOnly = false; this.selectionStart = 0; this.selectionEnd = 0; }
  append(...values) { for (const value of values) this.children.push(value); }
  appendChild(value) { this.children.push(value); return value; }
  replaceChildren(...values) { this.children = [...values]; }
  setAttribute() {}
  removeAttribute() {}
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
}
class FakeDocument extends EventTarget { constructor() { super(); this.activeElement = null; this.body = new FakeElement('body', this); } createElement(tag) { return new FakeElement(tag, this); } }
function node(id, kind, name, children) { return { id, name, kind, data: Object.create(null), children: children || [] }; }
function tree() { return node('r', 'folder', 'Root', [node('a', 'folder', 'Alpha', [node('x', 'file', 'Data')]), node('b', 'file', 'Beta')]); }
function setup() {
  const source = tree();
  const { graph } = loadTree(source);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport: { width: 1100, height: 473 }, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  model.select('a');
  const live = { tree: source, graph, baseLayout, model, session: null };
  const authority = { datasetToken: 1, revision: 4 };
  let candidateEnv = null;
  let frames = 0;
  let commits = 0;
  let lastPrepared = null;
  const frame = (args) => {
    const env = candidateEnv || live;
    const prepared = stageExplorationFrame({
      graph: env.graph, baseLayout: env.baseLayout, view: env.model.view(), viewport: { width: 1100, height: 473 },
      baseRadiusCss: 198.66, fit: args.fit, entry: args.entry, camera: args.camera,
      framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: new Map(),
      adapters: { draw: () => {}, labels: () => {}, installHit: () => {} }
    });
    frames += 1;
    lastPrepared = prepared;
    return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({ model, frame, invalidate: () => {}, publish: () => {}, initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS });
  live.session = session;
  const document = new FakeDocument();
  const summaryHost = document.createElement('div');
  const editorHost = document.createElement('div');
  const controller = createEditorController();
  let discardHandler = () => {};
  const panel = createEditorPanel({
    document, summaryHost, editorHost, controller,
    getIdentity: () => ({ datasetToken: authority.datasetToken, baseRevision: authority.revision }),
    onDiscardIntent: (intent) => discardHandler(intent),
    onSave: (value) => performRenameInstallation({
      tree: live.tree, graph: live.graph, baseLayout: live.baseLayout, model: live.model, session: live.session,
      targetId: value.targetId, draftName: value.name,
      datasetToken: value.datasetToken, baseRevision: value.baseRevision,
      expectedDatasetToken: authority.datasetToken, expectedRevision: authority.revision,
      structuralRootId: 'r', frame,
      setCandidateEnv: (env) => { candidateEnv = env; },
      commit: (candidate, candidateSession) => {
        commits += 1;
        live.tree = candidate.tree; live.graph = candidate.graph; live.model = candidate.model; live.session = candidateSession;
        authority.revision += 1;
      },
      recover: () => recoverAuthoritativeSession(live.session)
    })
  });
  panel.setDetails(model.details('a'));
  const flow = (target) => chooseEditorTargetFlow({ target, editorController: controller, graph: live.graph, visibleSet: model.view().visibleSet, datasetToken: authority.datasetToken, baseRevision: authority.revision, getDetails: (id) => model.details(id), openEditor: (details) => panel.openEditor(details), requestPrompt: (pending) => panel.requestSelection(pending) });
  const resume = (target) => resumeEditorTarget({ target, editorController: controller, graph: live.graph, visibleSet: model.view().visibleSet, datasetToken: authority.datasetToken, baseRevision: authority.revision, getDetails: (id) => model.details(id), openEditor: (details) => panel.openEditor(details), requestPrompt: (pending) => panel.requestSelection(pending) });
  discardHandler = (intent) => resume(intent);
  function seed() {
    const result = session.run('seed', () => ({ ok: true, fit: true }), { fit: false, eventKind: 'programmatic' });
    if (!result.ok) throw result.error;
    return lastPrepared;
  }
  return { live, authority, document, panel, controller, flow, seed, get frames() { return frames; }, get commits() { return commits; }, get candidateEnv() { return candidateEnv; } };
}
function keydown(key) { const event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'key', { value: key }); Object.defineProperty(event, 'isComposing', { value: false }); return event; }

for (const changed of ['revision', 'datasetToken']) {
  test(`open→panel→save rejects stale ${changed} with retained draft`, () => {
    const s = setup();
    const oldTree = s.live.tree;
    s.panel.openEditor(s.live.model.details('a'));
    s.panel.input.value = 'Renamed';
    s.panel.input.dispatchEvent(new Event('input'));
    if (changed === 'revision') s.authority.revision += 1;
    else s.authority.datasetToken += 1;
    s.panel.input.dispatchEvent(keydown('Enter'));
    assert.equal(s.controller.draftName, 'Renamed');
    assert.equal(s.controller.error.includes('changed') || s.controller.error.includes('Reopen'), true);
    assert.equal(s.panel.form.hidden, false);
    assert.equal(s.live.tree, oldTree);
    assert.equal(s.commits, 0);
    assert.equal(s.frames, 0);
    assert.equal(s.candidateEnv, null);
  });
}
class HitCanvas {
  constructor() { this.width = 1100; this.height = 473; this.clientLeft = 0; this.clientTop = 0; this.clientWidth = 1100; this.clientHeight = 473; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1100, height: 473 }; }
}
test('data circle locations resolve editor targets; direct data edit saves without navigation', () => {
  const s = setup();
  const prepared = s.seed();
  const focusBefore = s.live.model.focusedFolderId;
  const selectedBefore = s.live.model.selectedId;
  const layoutBefore = s.live.baseLayout;
  const cameraBefore = s.live.session.getState().camera;
  const canvas = new HitCanvas();
  const node = prepared.scene.nodes.get('x');
  const target = resolveEditorTarget({
    event: { button: 2, clientX: node.center.x, clientY: node.center.y },
    canvas, frameState: { hit: prepared.hit }, graph: s.live.graph
  });
  assert.equal(target?.id, 'x');
  const details = s.live.model.details('x');
  assert.equal(s.panel.openEditor(details).ok, true);
  assert.equal(s.controller.targetId, 'x');
  s.panel.input.value = 'Renamed data';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.input.dispatchEvent(keydown('Enter'));
  assert.equal(s.live.graph.nodes.get('x').name, 'Renamed data');
  assert.equal(s.live.model.focusedFolderId, focusBefore);
  assert.equal(s.live.model.selectedId, selectedBefore);
  assert.equal(s.live.baseLayout, layoutBefore);
  assert.equal(s.live.session.getState().camera.x, cameraBefore.x);
  assert.equal(s.live.session.getState().camera.zoom, cameraBefore.zoom);
  assert.equal(s.controller.mode, 'closed');
});
class ClickCanvas extends HitCanvas {}
test('left-click folder, data, and background never open the editor', () => {
  const s = setup();
  const prepared = s.seed();
  const canvas = new ClickCanvas();
  const click = (id) => {
    const node = id ? prepared.scene.nodes.get(id) : null;
    return handleExplorationCanvasClick({
      event: { button: 0, clientX: node ? node.center.x : 1, clientY: node ? node.center.y : 1 },
      canvas, frameState: { hit: prepared.hit }, session: s.live.session,
      model: s.live.model, graph: s.live.graph
    });
  };
  assert.equal(click('a').ok, true);
  assert.equal(s.controller.mode, 'closed');
  assert.equal(click('x').ok, true);
  assert.equal(s.controller.mode, 'closed');
  assert.equal(click(null).ok, true);
  assert.equal(s.controller.mode, 'closed');
});
test('initial root details use actual graph metadata without opening an editor', () => {
  const s = setup();
  s.seed();
  const root = s.live.model.details('r');
  s.panel.setDetails(root);
  assert.equal(s.panel.getSummaryValue('Name'), 'Root');
  assert.equal(s.panel.getSummaryValue('Stable ID'), null);
  assert.equal(s.controller.mode, 'closed');
  assert.equal(s.panel.form.hidden, true);
});
test('right-click menu Rename opens the form only after choosing the item', () => {
  const s = setup();
  const prepared = s.seed();
  const node = prepared.scene.nodes.get('x');
  const menu = createEditorContextMenu({
    document: s.document, host: s.document.body,
    viewport: () => ({ width: 1100, height: 473 }),
    onRename: (target) => s.panel.openEditor(s.live.model.details(target.id))
  });
  const target = createEditorTarget({
    id: 'x', hitKind: 'file', name: 'Data', datasetToken: s.authority.datasetToken, baseRevision: s.authority.revision
  });
  menu.open({ target, x: 20, y: 20 });
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.controller.mode, 'closed');
  menu.item.dispatchEvent(new Event('click'));
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.controller.targetId, 'x');
  assert.match(s.panel.getTargetLabel(), /Data/);
  s.panel.input.dispatchEvent(keydown('Escape'));
  assert.equal(s.panel.form.hidden, true);
  menu.destroy();
});
test('menu target A/B dirty Continue and Discard preserve navigation and open the exact target', () => {
  const s = setup();
  s.seed();
  const menu = createEditorContextMenu({
    document: s.document, host: s.document.body,
    viewport: () => ({ width: 1100, height: 473 }),
    onRename: (target) => s.flow(target)
  });
  const target = (id) => createEditorTarget({
    id, hitKind: s.live.graph.nodes.get(id).kind, name: s.live.graph.nodes.get(id).name,
    datasetToken: s.authority.datasetToken, baseRevision: s.authority.revision
  });
  const focus = s.live.model.focusedFolderId;
  const selected = s.live.model.selectedId;
  const camera = s.live.session.getState().camera;
  const layout = s.live.baseLayout;

  menu.open({ target: target('a'), x: 20, y: 20 });
  menu.item.dispatchEvent(new Event('click'));
  assert.equal(s.controller.targetId, 'a');
  s.panel.input.value = 'Changed A';
  s.panel.input.dispatchEvent(new Event('input'));

  menu.open({ target: target('a'), x: 20, y: 20 });
  menu.item.dispatchEvent(new Event('click'));
  assert.equal(s.controller.targetId, 'a');
  assert.equal(s.controller.draftName, 'Changed A');

  menu.open({ target: target('x'), x: 30, y: 30 });
  menu.item.dispatchEvent(new Event('click'));
  assert.equal(s.panel.prompt.hidden, false);
  assert.equal(s.controller.targetId, 'a');
  const keep = s.panel.prompt.children[1].children[0];
  keep.dispatchEvent(new Event('click'));
  assert.equal(s.controller.targetId, 'a');
  assert.equal(s.controller.draftName, 'Changed A');
  assert.equal(s.panel.form.hidden, false);

  menu.open({ target: target('x'), x: 30, y: 30 });
  menu.item.dispatchEvent(new Event('click'));
  const discard = s.panel.prompt.children[1].children[1];
  discard.dispatchEvent(new Event('click'));
  assert.equal(s.controller.targetId, 'x');
  assert.equal(s.controller.draftName, 'Data');
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.live.model.focusedFolderId, focus);
  assert.equal(s.live.model.selectedId, selected);
  assert.equal(s.live.session.getState().camera.x, camera.x);
  assert.equal(s.live.session.getState().camera.zoom, camera.zoom);
  assert.equal(s.live.baseLayout, layout);
  s.panel.openEditor(s.live.model.details('a'));
  menu.destroy();
});

test('stale pending editor target is rejected after data identity changes', () => {
  const s = setup();
  s.seed();
  const menu = createEditorContextMenu({
    document: s.document, host: s.document.body,
    viewport: () => ({ width: 1100, height: 473 }),
    onRename: (target) => s.flow(target)
  });
  const target = (id) => createEditorTarget({ id, hitKind: s.live.graph.nodes.get(id).kind, datasetToken: s.authority.datasetToken, baseRevision: s.authority.revision });
  menu.open({ target: target('a'), x: 20, y: 20 });
  menu.item.dispatchEvent(new Event('click'));
  s.panel.input.value = 'Changed A';
  s.panel.input.dispatchEvent(new Event('input'));
  menu.open({ target: target('x'), x: 30, y: 30 });
  menu.item.dispatchEvent(new Event('click'));
  s.authority.revision += 1;
  const discard = s.panel.prompt.children[1].children[1];
  discard.dispatchEvent(new Event('click'));
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.controller.mode, 'closed');
  menu.destroy();
});





