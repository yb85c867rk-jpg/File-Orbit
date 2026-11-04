import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import {
  createExplorationModel, createExplorationSession, recoverAuthoritativeSession, stageExplorationFrame
} from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createEditorController, createEditorIdAllocator, createEditorTarget
} from '../../../src/engine/hypertree/editor/index.js';
import { createEditorPanel } from '../../harness/m5-exploration/editor-panel.js';
import { createEditorContextMenu } from '../../harness/m5-exploration/editor-context-menu.js';
import { chooseEditorAction, resumeEditorAction } from '../../../src/engine/hypertree/editor/activation-flow.js';
import { performAddChildInstallation, performMetadataInstallation, performEditFolderInstallation, performEditDataInstallation } from '../../../src/engine/hypertree/editor/action.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';

const viewport = { width: 1100, height: 473 };
function node(id, kind, name, children, data = {}) {
  return { id, name, kind, data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }, data), ...(children ? { children } : {}) };
}
function sourceTree() {
  return node('r', 'folder', 'Root', [node('a', 'folder', 'Alpha', [node('x', 'file', 'Data', null, { description: 'old', link: 'https://old.example/a' })]), node('b', 'file', 'Beta')]);
}

class FakeElement extends EventTarget {
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attributes = new Map(); this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.readOnly = false; this.parentNode = null; this.style = {}; this.selectionStart = 0; this.selectionEnd = 0; }
  append(...values) { for (const value of values) { this.children.push(value); if (value) value.parentNode = this; } }
  appendChild(value) { this.append(value); return value; }
  removeChild(value) { this.children = this.children.filter((item) => item !== value); value.parentNode = null; }
  replaceChildren(...values) { this.children = []; this.append(...values); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.ownerDocument.activeElement = this; }
  select() { this.selected = true; }
  contains(value) { return value === this || this.children.some((child) => child.contains?.(value)); }
  getBoundingClientRect() { return { width: 120, height: 100 }; }
}
class FakeDocument extends EventTarget {
  constructor() { super(); this.activeElement = null; this.body = new FakeElement('body', this); }
  createElement(tag) { return new FakeElement(tag, this); }
}
function keydown(key) { const event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'key', { value: key }); Object.defineProperty(event, 'isComposing', { value: false }); return event; }

function setup() {
  const tree = sourceTree();
  const { graph } = loadTree(tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  model.select('x');
  const live = { tree, graph, baseLayout, model, session: null };
  const authority = { datasetToken: 1, revision: 0 };
  const allocator = createEditorIdAllocator({ datasetToken: authority.datasetToken });
  const attachments = createAttachmentRegistry({ datasetToken: authority.datasetToken });
  let candidateEnv = null;
  let scene = null;
  let hit = null;
  let commits = 0;
  let failDraw = false;
  const frame = (args) => {
    const env = candidateEnv || live;
    const prepared = stageExplorationFrame({
      graph: env.graph, baseLayout: env.baseLayout, view: env.model.view(), viewport,
      baseRadiusCss: 198.66, fit: args.fit, entry: args.entry, camera: args.camera,
      framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: new Map(),
      adapters: { draw: () => { if (failDraw && candidateEnv) throw new Error('draw failed'); }, labels: () => {}, installHit: () => {} }
    });
    hit = prepared.hit;
    scene = prepared.scene;
    return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({
    model, frame, invalidate: () => {}, publish: () => {},
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  live.session = session;
  const document = new FakeDocument();
  const summaryHost = document.createElement('div');
  const editorHost = document.createElement('div');
  const controller = createEditorController();
  const commit = (candidate, candidateSession) => {
    commits += 1;
    live.tree = candidate.tree; live.graph = candidate.graph; live.baseLayout = candidate.baseLayout;
    live.model = candidate.model; live.session = candidateSession;
    authority.revision += 1;
    const selected = candidate.model.selectedId;
    if (selected) panel.setDetails(candidate.model.details(selected));
  };
  const recover = () => recoverAuthoritativeSession(live.session);
  const install = (value) => {
    const base = {
      tree: live.tree, graph: live.graph, baseLayout: live.baseLayout, model: live.model, session: live.session,
      datasetToken: value.datasetToken, baseRevision: value.baseRevision,
      expectedDatasetToken: authority.datasetToken, expectedRevision: authority.revision,
      structuralRootId: 'r', viewport, baseRadiusCss: 198.66, frame,
      setCandidateEnv: (env) => { candidateEnv = env; }, commit, recover
    };
    let result;
    let attachmentMetadata = null;
    if (value.action === 'add-data' && value.dataType === 'file') {
      attachmentMetadata = attachments.metadata(value.attachmentId);
      if (!attachmentMetadata) return { ok: false, message: 'pending attachment missing', field: 'file' };
    }
    if (value.action === 'add-folder' || value.action === 'add-data') {
      result = performAddChildInstallation({
        ...base, parentId: value.targetId, kind: value.action === 'add-folder' ? 'folder' : 'file',
        draftName: value.name, draftDescription: value.description, draftLink: value.link,
        draftDataType: value.dataType, draftAttachment: attachmentMetadata,
        parentDepth: live.baseLayout.depths?.get(value.targetId), allocator
      });
    } else if (value.action === 'edit-folder') {
      result = performEditFolderInstallation({ ...base, targetId: value.targetId, draftName: value.name, draftDescription: value.description });
    } else if (value.action === 'edit-data') {
      result = performEditDataInstallation({ ...base, targetId: value.targetId, draftName: value.name, description: value.description, link: value.link, linkProvided: value.linkProvided });
    } else {
      result = { ok: false, message: 'unsupported' };
    }
    if (result.ok && attachmentMetadata) attachments.commit(attachmentMetadata.attachmentId);
    if (result.ok && value.action === 'edit-data') panel.setDetails(live.model.details(value.targetId));
    return result;
  };
  const panel = createEditorPanel({
    document, summaryHost, editorHost, controller,
    attachments,
    getIdentity: () => ({ datasetToken: authority.datasetToken, baseRevision: authority.revision }),
    onSave: install,
    onDiscardIntent: (intent) => resumeEditorAction({
      target: intent, editorController: controller, graph: live.graph, visibleSet: live.model.view().visibleSet,
      datasetToken: authority.datasetToken, baseRevision: authority.revision,
      getDetails: (id) => live.model.details(id),
      openAction: (details, action) => panel.openAction(details, action),
      requestPrompt: (pending) => panel.requestSelection(pending)
    })
  });
  panel.setDetails(live.model.details('x'));
  const menu = createEditorContextMenu({
    document, host: document.body, viewport: () => viewport,
    onAction: (target, action) => chooseEditorAction({
      action, target, editorController: controller, graph: live.graph, visibleSet: live.model.view().visibleSet,
      datasetToken: authority.datasetToken, baseRevision: authority.revision,
      getDetails: (id) => live.model.details(id),
      openAction: (details, selected) => panel.openAction(details, selected),
      requestPrompt: (pending) => panel.requestSelection(pending)
    })
  });
  return { live, authority, document, controller, panel, menu, attachments, setFailDraw: (value) => { failDraw = value; }, get commits() { return commits; }, get hit() { return hit; }, get scene() { return scene; } };
}
function target(id, s) {
  const details = s.live.model.details(id);
  return createEditorTarget({ id, hitKind: details.kind, name: details.name, datasetToken: s.authority.datasetToken, baseRevision: s.authority.revision });
}
function choose(s, id, action) {
  s.menu.open({ target: target(id, s), x: 20, y: 20 });
  s.menu.actions.get(action).dispatchEvent(new Event('click'));
}

test('shared menu flow adds folder/data and edits metadata through the real action path', () => {
  const s = setup();
  const focus = s.live.model.focusedFolderId;
  choose(s, 'r', 'add-folder');
  assert.equal(s.controller.action, 'add-folder');
  assert.equal(s.controller.targetId, 'r');
  s.panel.input.value = 'New folder';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.live.tree.children.at(-1).name, 'New folder');
  assert.equal(s.live.model.focusedFolderId, focus);
  assert.equal(s.live.model.selectedId, s.live.tree.children.at(-1).id);

  choose(s, 'a', 'add-data');
  s.panel.dataTypeInput.value = 'web-link';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  s.panel.input.value = 'New data';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'line one\nline two';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.linkInput.value = 'https://example.com/new';
  s.panel.linkInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  const added = s.live.tree.children[0].children.at(-1);
  assert.equal(added.name, 'New data');
  assert.equal(added.data.description, 'line one\nline two');
  assert.equal(added.data.link, 'https://example.com/new');
  assert.equal(s.live.model.selectedId, added.id);
  assert.ok(s.hit);

  const camera = s.live.session.getState().camera;
  const layout = s.live.baseLayout;
  choose(s, 'x', 'edit-data');
  s.panel.descriptionInput.value = 'edited';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.live.tree.children[0].children[0].data.description, 'edited');
  assert.equal(s.live.baseLayout, layout);
  assert.equal(s.live.session.getState().camera.x, camera.x);
  s.menu.destroy();
});

test('shared dirty replacement preserves Add draft and Discard opens Edit details once', () => {
  const s = setup();
  choose(s, 'r', 'add-folder');
  s.panel.input.value = 'Pending folder';
  s.panel.input.dispatchEvent(new Event('input'));
  choose(s, 'x', 'edit-data');
  assert.equal(s.panel.prompt.hidden, false);
  assert.equal(s.controller.action, 'add-folder');
  s.panel.prompt.children[1].children[0].dispatchEvent(new Event('click'));
  assert.equal(s.controller.action, 'add-folder');
  assert.equal(s.controller.draftName, 'Pending folder');
  choose(s, 'x', 'edit-data');
  s.panel.prompt.children[1].children[1].dispatchEvent(new Event('click'));
  assert.equal(s.controller.action, 'edit-data');
  assert.equal(s.controller.targetId, 'x');
  assert.equal(s.panel.descriptionInput.value, 'old');
  s.menu.destroy();
});
test('stale pending E2 action rejects after identity changes', () => {
  const s = setup();
  choose(s, 'r', 'add-folder');
  s.panel.input.value = 'Pending folder';
  s.panel.input.dispatchEvent(new Event('input'));
  choose(s, 'x', 'edit-data');
  s.authority.revision += 1;
  s.panel.prompt.children[1].children[1].dispatchEvent(new Event('click'));
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.controller.mode, 'closed');
  assert.equal(s.commits, 0);
  s.menu.destroy();
});
test('same folder target with a different action prompts and preserves the draft', () => {
  const s = setup();
  choose(s, 'r', 'add-folder');
  s.panel.input.value = 'Folder draft';
  s.panel.input.dispatchEvent(new Event('input'));
  choose(s, 'r', 'add-data');
  assert.equal(s.panel.prompt.hidden, false);
  assert.equal(s.controller.action, 'add-folder');
  s.panel.prompt.children[1].children[0].dispatchEvent(new Event('click'));
  assert.equal(s.controller.action, 'add-folder');
  assert.equal(s.controller.draftName, 'Folder draft');
  s.menu.destroy();
});
test('metadata edit preserves selected A while showing B details and full camera/framing', () => {
  const s = setup();
  s.live.model.select('a');
  s.live.session.setCamera({ zoom: 1.6, panX: 24, panY: -19 }, 'manual');
  const oldCamera = { ...s.live.session.getState().camera };
  const oldFraming = s.live.session.getState().framing;
  const oldFocus = s.live.model.focusedFolderId;
  const oldLayout = s.live.baseLayout;
  choose(s, 'x', 'edit-data');
  s.panel.descriptionInput.value = 'changed B';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.live.tree.children[0].children[0].data.description, 'changed B');
  assert.equal(s.live.model.selectedId, 'a');
  assert.equal(s.live.model.focusedFolderId, oldFocus);
  assert.equal(s.panel.getSummaryValue('Name'), 'Data');
  assert.equal(s.live.baseLayout, oldLayout);
  assert.deepEqual(s.live.session.getState().camera, oldCamera);
  assert.equal(s.live.session.getState().framing, oldFraming);
  const center = s.scene.nodes.get('x')?.center;
  assert.ok(center);
  assert.equal(hitTestNode(s.hit, center), 'x');
  s.menu.destroy();
});

test('metadata edit preserves an original null selection', () => {
  const s = setup();
  s.live.model.clearSelection();
  choose(s, 'x', 'edit-data');
  s.panel.descriptionInput.value = 'null selection edit';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.live.model.selectedId, null);
  assert.equal(s.panel.getSummaryValue('Name'), 'Data');
  assert.equal(s.live.tree.children[0].children[0].data.description, 'null selection edit');
  s.menu.destroy();
});
test('file add uses the picker, async classification, and registry ownership', async () => {
  const s = setup();
  choose(s, 'r', 'add-data');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  assert.equal(s.panel.isFieldVisible('file'), true);
  assert.equal(s.panel.isFieldVisible('link'), false);
  s.panel.input.value = 'Markdown item';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Description';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  const file = new File([new TextEncoder().encode('# hello')], 'Note.MD', { type: 'text/markdown' });
  s.panel.fileInput.files = [file];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  assert.equal(s.panel.saveButton.disabled, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(s.panel.saveButton.disabled, false);
  assert.match(s.panel.getAttachmentText(), /Note\.MD/);
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  const added = s.live.tree.children.at(-1);
  assert.equal(added.data.dataType, 'file');
  assert.equal(added.data.originalName, 'Note.MD');
  assert.equal(added.data.classification.format, 'markdown');
  assert.equal(added.data.classification.badge, 'MD');
  assert.equal(typeof added.data.attachmentId, 'string');
  assert.equal(s.attachments.has(added.data.attachmentId), true);
  assert.equal(s.attachments.get(added.data.attachmentId).committed, true);
  assert.equal(JSON.stringify(added.data).includes('hello'), false);
  assert.equal(JSON.stringify(added.data).includes('hello'), false);
  s.live.session.setCamera({ zoom: 1.5, panX: 12, panY: -9 }, 'manual');
  const beforeCamera = { ...s.live.session.getState().camera };
  const beforeFraming = s.live.session.getState().framing;
  const beforeFocus = s.live.model.focusedFolderId;
  s.live.model.select('a');
  choose(s, added.id, 'edit-data');
  s.panel.descriptionInput.value = '   ';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, false);
  assert.match(s.controller.error, /Description is required/);
  s.panel.descriptionInput.value = 'Valid file description';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  const edited = s.live.tree.children.find((entry) => entry.id === added.id);
  assert.equal(edited.data.attachmentId, added.data.attachmentId);
  assert.equal(edited.data.originalName, 'Note.MD');
  assert.equal(edited.data.classification.badge, 'MD');
  assert.equal(s.live.model.selectedId, 'a');
  assert.equal(s.live.model.focusedFolderId, beforeFocus);
  assert.deepEqual(s.live.session.getState().camera, beforeCamera);
  assert.equal(s.live.session.getState().framing, beforeFraming);
  s.menu.destroy();
});
test('failed file installation retains the accounted pending reservation for retry', async () => {
  const s = setup();
  choose(s, 'r', 'add-data');
  s.panel.dataTypeInput.value = 'file';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  s.panel.input.value = 'Will fail';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Body';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  const file = new File([new TextEncoder().encode('%PDF-1.7')], 'Fail.PDF', { type: 'application/pdf' });
  s.panel.fileInput.files = [file];
  s.panel.fileInput.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  s.setFailDraw(true);
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.attachments.size, 1);
  assert.equal(s.attachments.totalBytes, file.size);
  assert.equal(s.attachments.snapshot()[0].committed, false);
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.panel.input.value, 'Will fail');
  s.setFailDraw(false);
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.attachments.size, 1);
  assert.equal(s.attachments.snapshot()[0].committed, true);
  s.menu.destroy();
});
test('Add Folder stores description', () => {
  const s = setup();
  choose(s, 'r', 'add-folder');
  s.panel.input.value = 'Described';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Folder body';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  const folder = s.live.tree.children.at(-1);
  assert.equal(folder.data.description, 'Folder body');
  s.menu.destroy();
});
test('forged Add Data against a data target rejects without a form or mutation', () => {
  const s = setup();
  let opened = false;
  const before = s.live.tree.children[0].children.length;
  const outcome = chooseEditorAction({
    action: 'add-data', target: target('x', s), editorController: s.controller,
    graph: s.live.graph, visibleSet: s.live.model.view().visibleSet,
    datasetToken: s.authority.datasetToken, baseRevision: s.authority.revision,
    getDetails: (id) => s.live.model.details(id),
    openAction: () => { opened = true; return { ok: true }; },
    requestPrompt: () => {}, onDiagnostic: () => {}
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'action-kind-mismatch');
  assert.equal(opened, false);
  assert.equal(s.live.tree.children[0].children.length, before);
  s.menu.destroy();
});
test('Edit Folder form installs name and description atomically', () => {
  const s = setup();
  s.live.model.select('x');
  choose(s, 'a', 'edit-folder');
  s.panel.input.value = 'Alpha 2';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Alpha body';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  const edited = s.live.tree.children[0];
  assert.equal(edited.name, 'Alpha 2');
  assert.equal(edited.data.description, 'Alpha body');
  assert.equal(s.live.model.selectedId, 'x');
  s.menu.destroy();
});
function growTo301(s) {
  for (let i = 0; i < 297; i += 1) {
    s.live.tree.children.push(node(`extra-${i}`, 'file', `Extra ${i}`));
  }
  assert.equal(countAdmissionNodes(s.live.tree), 301);
}
function countAdmissionNodes(tree) {
  let count = 0;
  const stack = [tree];
  while (stack.length) {
    const current = stack.pop();
    count += 1;
    for (const child of current.children || []) stack.push(child);
  }
  return count;
}
test('Edit Folder form rejects 301 nodes, retains draft, and does not commit', () => {
  const s = setup();
  growTo301(s);
  choose(s, 'a', 'edit-folder');
  s.panel.input.value = 'Should not save';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, false);
  assert.match(s.controller.error, /300/);
  assert.equal(s.controller.draftName, 'Should not save');
  assert.equal(s.live.tree.children[0].name, 'Alpha');
  assert.equal(s.authority.revision, 0);
  assert.equal(s.commits, 0);
  s.panel.destroy(); s.menu.destroy();
});
test('Edit Data form rejects 301 nodes, retains draft, and does not commit', () => {
  const s = setup();
  growTo301(s);
  choose(s, 'x', 'edit-data');
  s.panel.descriptionInput.value = 'Should not save';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, false);
  assert.match(s.controller.error, /300/);
  assert.equal(s.controller.draftDescription, 'Should not save');
  assert.equal(s.live.tree.children[0].children[0].data.description, 'old');
  assert.equal(s.authority.revision, 0);
  assert.equal(s.commits, 0);
  s.panel.destroy(); s.menu.destroy();
});
test('Edit Folder no-op on 301 nodes still rejects and keeps the form open', () => {
  const s = setup();
  growTo301(s);
  choose(s, 'a', 'edit-folder');
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, false);
  assert.match(s.controller.error, /300/);
  assert.equal(s.live.tree.children[0].name, 'Alpha');
  assert.equal(s.authority.revision, 0);
  assert.equal(s.commits, 0);
  s.panel.destroy(); s.menu.destroy();
});
test('Add and Edit Data normalize domain-style links and keep normalized no-op', () => {
  const s = setup();
  choose(s, 'r', 'add-data');
  s.panel.dataTypeInput.value = 'web-link';
  s.panel.dataTypeInput.dispatchEvent(new Event('change'));
  s.panel.input.value = 'Search';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Search engine';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.linkInput.value = 'google.com/search?q=test';
  s.panel.linkInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  const added = s.live.tree.children.at(-1);
  assert.equal(added.data.link, 'https://google.com/search?q=test');
  const revision = s.authority.revision;
  choose(s, added.id, 'edit-data');
  assert.equal(s.panel.getFieldValue('link'), 'https://google.com/search?q=test');
  s.panel.linkInput.value = 'https://google.com/search?q=test';
  s.panel.linkInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.authority.revision, revision);
  assert.equal(s.panel.form.hidden, true);
  s.menu.destroy();
});
test('invalid normalized link keeps the Edit Data draft and authoritative state', () => {
  const s = setup();
  s.live.tree.children[0].children[0].data.dataType = 'web-link';
  s.live.graph.nodes.get('x').data.dataType = 'web-link';
  choose(s, 'x', 'edit-data');
  s.panel.linkInput.value = 'javascript:alert(1)';
  s.panel.linkInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, false);
  assert.equal(s.controller.draftLink, 'javascript:alert(1)');
  assert.equal(s.live.tree.children[0].children[0].data.link, 'https://old.example/a');
  s.menu.destroy();
});
test('slash-less stored link edits as normalized no-op without revision', () => {
  const s = setup();
  s.live.tree.children[0].children[0].data.link = 'https://example.com';
  s.live.graph.nodes.get('x').data.link = 'https://example.com';
  s.live.tree.children[0].children[0].data.dataType = 'web-link';
  s.live.graph.nodes.get('x').data.dataType = 'web-link';
  choose(s, 'x', 'edit-data');
  assert.equal(s.panel.getFieldValue('link'), 'https://example.com');
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(s.panel.form.hidden, true);
  assert.equal(s.authority.revision, 0);
  assert.equal(s.commits, 0);
  assert.equal(s.live.tree.children[0].children[0].data.link, 'https://example.com');
  s.menu.destroy();
});test('legacy Edit Data hides URL, preserves link metadata, and changes only name/description', () => {
  const s = setup();
  choose(s, 'x', 'edit-data');
  assert.equal(s.panel.isFieldVisible('link'), false);
  assert.equal(s.panel.isFieldVisible('file'), false);
  s.panel.input.value = 'Legacy renamed';
  s.panel.input.dispatchEvent(new Event('input'));
  s.panel.descriptionInput.value = 'Legacy description';
  s.panel.descriptionInput.dispatchEvent(new Event('input'));
  s.panel.form.dispatchEvent(new Event('submit', { cancelable: true }));
  const edited = s.live.tree.children[0].children[0];
  assert.equal(edited.name, 'Legacy renamed');
  assert.equal(edited.data.description, 'Legacy description');
  assert.equal(edited.data.link, 'https://old.example/a');
  assert.equal(edited.data.dataType, undefined);
  assert.equal(s.panel.form.hidden, true);
  s.menu.destroy();
});test('forged Delete actions reject without a form while Delete controls remain disabled', () => {
  const s = setup();
  let opened = false;
  const run = (action, id) => chooseEditorAction({
    action, target: target(id, s), editorController: s.controller,
    graph: s.live.graph, visibleSet: s.live.model.view().visibleSet,
    datasetToken: s.authority.datasetToken, baseRevision: s.authority.revision,
    getDetails: (value) => s.live.model.details(value),
    openAction: () => { opened = true; return { ok: true }; },
    requestPrompt: () => {}, onDiagnostic: () => {}
  });
  assert.equal(run('delete-data', 'x').reason, 'delete-unavailable');
  assert.equal(run('delete-folder', 'r').reason, 'delete-unavailable');
  assert.equal(run('delete-folder', 'a').reason, 'delete-unavailable');
  assert.equal(opened, false);
  s.menu.destroy();
});



