import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createExplorationModel, createExplorationSession, recoverAuthoritativeSession, stageExplorationFrame
} from '../../../src/engine/hypertree/exploration/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import {
  createEditorIdAllocator, validateAddChild, validateFolderEdit, validateDataEdit, validateMetadataEdit, countTreeNodes,
  validateDescription, validateLink, MAX_DESCRIPTION_CODE_POINTS, MAX_LINK_CODE_POINTS
} from '../../../src/engine/hypertree/editor/validation.js';
import { buildAddChildCommand, buildMetadataCommand, buildRenameCommand, buildEditFolderCommand, buildEditDataCommand } from '../../../src/engine/hypertree/editor/commands.js';
import { performAddChildInstallation, performMetadataInstallation, performEditFolderInstallation, performEditDataInstallation } from '../../../src/engine/hypertree/editor/action.js';

const viewport = { width: 1100, height: 473 };
function node(id, kind, name, children, data = {}) {
  return { id, name, kind, data: Object.assign(Object.create(null), { $dim: 4, $angularWidth: 1 }, data), ...(children ? { children } : {}) };
}
function baseTree(count = 4) {
  const root = node('r', 'folder', 'Root', [node('a', 'folder', 'Alpha', [node('x', 'file', 'Data', null, { description: 'old', link: 'https://old.example/path' })]), node('b', 'file', 'Beta')]);
  for (let i = 0; i < count - 4; i += 1) root.children.push(node(`n${i}`, 'file', `Node ${i}`));
  return root;
}
function setup(seed = baseTree()) {
  const source = seed;
  const { graph } = loadTree(source);
  const staged = stageExperimentalV2Layout(graph, { rootId: 'r', phases: ['current'], nodeOptions: { overridable: true } });
  const baseLayout = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, projectionBaseRadiusCss: 198.66, phase: 'current' }).staged;
  const model = createExplorationModel({ graph, baseLayout, structuralRootId: 'r', phase: 'current' });
  model.select('a');
  const live = { tree: source, graph, baseLayout, model, session: null };
  let candidateEnv = null;
  let frames = 0;
  let fit = null;
  let committed = null;
  let fail = null;
  let scene = null;
  let hit = null;
  const frame = (args) => {
    const env = candidateEnv || live;
    const prepared = stageExplorationFrame({
      graph: env.graph, baseLayout: env.baseLayout, view: env.model.view(), viewport,
      baseRadiusCss: 198.66, fit: args.fit, entry: args.entry, camera: args.camera,
      framing: args.framing, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: new Map(),
      adapters: {
        draw: () => { if (fail === 'draw' && candidateEnv) throw new Error('draw failed'); },
        labels: () => { if (fail === 'label' && candidateEnv) throw new Error('label failed'); },
        installHit: () => { if (fail === 'hit' && candidateEnv) throw new Error('hit failed'); }
      }
    });
    if (candidateEnv && !fail) { frames += 1; fit = args.fit; scene = prepared.scene; hit = prepared.hit; }
    return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
  };
  const session = createExplorationSession({
    model, frame, invalidate: () => {}, publish: () => {},
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  live.session = session;
  const commit = (candidate, candidateSession) => {
    committed = candidate;
    live.tree = candidate.tree; live.graph = candidate.graph; live.baseLayout = candidate.baseLayout;
    live.model = candidate.model; live.session = candidateSession;
  };
  const add = (overrides = {}) => performAddChildInstallation({
    tree: live.tree, graph: live.graph, baseLayout: live.baseLayout, model: live.model, session: live.session,
    parentId: 'r', kind: 'folder', draftName: 'New folder', draftDescription: null, draftLink: null,
    parentDepth: live.baseLayout.depths?.get('r') ?? 0,
    datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0, structuralRootId: 'r',
    allocator: createEditorIdAllocator({ datasetToken: 1 }), viewport, baseRadiusCss: 198.66,
    frame, setCandidateEnv: (env) => { candidateEnv = env; }, commit,
    recover: () => recoverAuthoritativeSession(live.session),
    ...overrides
  });
  const metadata = (overrides = {}) => performMetadataInstallation({
    tree: live.tree, graph: live.graph, baseLayout: live.baseLayout, model: live.model, session: live.session,
    targetId: 'x', description: 'new description', link: 'https://new.example/a',
    datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0, structuralRootId: 'r',
    viewport, baseRadiusCss: 198.66, frame, setCandidateEnv: (env) => { candidateEnv = env; },
    commit, recover: () => recoverAuthoritativeSession(live.session), ...overrides
  });
  return { live, add, metadata, setFail: (value) => { fail = value; }, get frames() { return frames; }, get fit() { return fit; }, get committed() { return committed; }, get scene() { return scene; }, get hit() { return hit; } };
}

test('E2 description/link validation preserves whitespace and rejects unsafe links', () => {
  assert.deepEqual(validateMetadataEdit({ tree: baseTree(), targetId: 'x', description: '  a\n b  ', link: ' https://example.com/a ' }).description, '  a\n b  ');
  assert.equal(validateMetadataEdit({ tree: baseTree(), targetId: 'x', description: '', link: '' }).ok, true);
  assert.equal(validateMetadataEdit({ tree: baseTree(), targetId: 'x', description: 'd', link: 'javascript:alert(1)' }).reason, 'link-scheme');
  assert.equal(validateMetadataEdit({ tree: baseTree(), targetId: 'x', description: 'd', link: 'https://user:pass@example.com' }).reason, 'link-credentials');
  assert.equal(validateMetadataEdit({ tree: baseTree(), targetId: 'a', description: 'd', link: '' }).reason, 'data-only');
});

test('add validation rejects duplicates, data parents, and the 300-node cap', () => {
  assert.equal(validateAddChild({ tree: baseTree(), parentId: 'r', kind: 'folder', draftName: 'Alpha' }).reason, 'duplicate-name');
  assert.equal(validateAddChild({ tree: baseTree(), parentId: 'b', kind: 'file', draftName: 'Nope' }).reason, 'not-folder');
  const at299 = baseTree(299);
  assert.equal(validateAddChild({ tree: at299, parentId: 'r', kind: 'file', draftName: 'Last', draftDescription: 'description', draftDataType: 'web-link', draftLink: 'https://example.com/last' }).ok, true);
  const at300 = baseTree(300);
  assert.equal(validateAddChild({ tree: at300, parentId: 'r', kind: 'file', draftName: 'Last', draftDescription: 'description', draftDataType: 'web-link', draftLink: 'https://example.com/last' }).reason, 'editor-node-limit');
});

test('add command appends last, reuses IDs safely, and rejects collisions', () => {
  const source = baseTree();
  const allocator = createEditorIdAllocator({ datasetToken: 7 });
  const command = buildAddChildCommand({
    tree: source, parentId: 'r', kind: 'file', draftName: 'Child',
    draftDescription: 'description', draftDataType: 'web-link', draftLink: 'https://example.com/a',
    datasetToken: 7, baseRevision: 2, expectedDatasetToken: 7, expectedRevision: 2, allocator
  });
  assert.equal(command.ok, true);
  assert.match(command.nodeId, /^fo-7-/);
  assert.equal(command.candidateTree.children.at(-1).id, command.nodeId);
  assert.equal(command.candidateTree.children.at(-1).data.description, 'description');
  assert.equal(source.children.length, 2);
  const collision = buildAddChildCommand({
    tree: source, parentId: 'r', kind: 'file', draftName: 'Other', draftDescription: 'description', draftDataType: 'web-link', draftLink: 'https://example.com/other',
    datasetToken: 7, baseRevision: 2, expectedDatasetToken: 7, expectedRevision: 2,
    allocator: { next: () => ({ ok: false, reason: 'id-exhausted' }) }
  });
  assert.equal(collision.reason, 'id-exhausted');
});

test('add installation appends, selects, fits, and preserves focus/order', () => {
  const s = setup();
  const ids = s.live.tree.children.map((child) => child.id);
  const focus = s.live.model.focusedFolderId;
  const result = s.add({ draftName: 'New folder' });
  assert.equal(result.ok, true);
  assert.equal(result.revision, 1);
  assert.equal(s.committed.tree.children.at(-1).name, 'New folder');
  assert.deepEqual(s.committed.tree.children.slice(0, ids.length).map((child) => child.id), ids);
  assert.equal(s.live.model.focusedFolderId, focus);
  assert.equal(s.live.model.selectedId, result.candidate.model.selectedId);
  assert.equal(s.fit, true);
  assert.equal(s.frames, 1);
  assert.equal(s.live.baseLayout.depths.get(result.candidate.model.selectedId), 1);
});

test('299→300 proceeds and 300→301 rejects before a frame', () => {
  const s = setup(baseTree(299));
  const result = s.add({ draftName: 'At 300' });
  assert.equal(result.ok, true);
  assert.equal(countTreeNodes(s.live.tree), 300);
  const s2 = setup(baseTree(300));
  const rejected = s2.add({ draftName: 'At 301' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'editor-node-limit');
  assert.equal(s2.frames, 0);
});

test('metadata installation preserves selection, layout, and the full camera and framing', () => {
  const s = setup();
  s.live.session.setCamera({ zoom: 1.7, panX: 33, panY: -21 }, 'manual');
  const oldLayout = s.live.baseLayout;
  const oldState = s.live.session.getState();
  const oldCamera = { ...oldState.camera };
  const oldFraming = oldState.framing;
  assert.notDeepEqual(oldCamera, { zoom: 1, panX: 0, panY: 0 });
  const result = s.metadata();
  assert.equal(result.ok, true);
  assert.equal(s.live.tree.children[0].children[0].data.description, 'new description');
  assert.equal(s.live.baseLayout, oldLayout);
  assert.deepEqual(s.live.session.getState().camera, oldCamera);
  assert.equal(s.live.session.getState().framing, oldFraming);
  assert.equal(s.live.model.selectedId, 'a');
  assert.equal(s.fit, false);
  const noop = s.metadata({ description: 'new description', link: 'https://new.example/a' });
  assert.equal(noop.noop, true);
  assert.equal(s.frames, 1);
  const missing = buildMetadataCommand({
    tree: baseTree(), targetId: 'b', description: null, link: null,
  });
  assert.equal(missing.noop, true);
});

test('add draw/label/hit failure preserves authoritative data', () => {
  for (const failure of ['draw', 'label', 'hit']) {
    const s = setup();
    const old = s.live.tree;
    s.setFail(failure);
    const result = s.add({ draftName: 'Broken' });
    assert.equal(result.ok, false);
    assert.equal(s.live.tree, old);
    assert.equal(s.committed, null);
  }
});
test('add data stores description/link and its data circle is hittable', () => {
  const s = setup();
  const result = s.add({ kind: 'file', draftName: 'New data', draftDescription: 'body', draftDataType: 'web-link', draftLink: 'https://example.com/new' });
  assert.equal(result.ok, true);
  const added = s.committed.tree.children.at(-1);
  assert.equal(added.kind, 'file');
  assert.equal(added.data.description, 'body');
  assert.equal(added.data.link, 'https://example.com/new');
  assert.equal(s.committed.model.view().visibleSet.has(added.id), true);
  const center = s.scene.nodes.get(added.id)?.center;
  assert.ok(center);
  assert.equal(hitTestNode(s.hit, center), added.id);
});
test('stable ID allocation skips full-tree collisions and never reuses an allocated ID', () => {
  const tree = baseTree();
  tree.children.push(node('fo-7-0', 'file', 'Collision'));
  const allocator = createEditorIdAllocator({ datasetToken: 7 });
  const first = allocator.next(tree);
  assert.equal(first.id, 'fo-7-1');
  const second = allocator.next(tree);
  assert.notEqual(second.id, first.id);
  const exhausted = createEditorIdAllocator({ datasetToken: 7, counter: Number.MAX_SAFE_INTEGER });
  assert.equal(exhausted.next(tree).ok, true);
  assert.equal(exhausted.next(tree).reason, 'id-exhausted');
});
test('description and link boundaries are enforced in code points', () => {
  assert.equal(validateDescription('a'.repeat(MAX_DESCRIPTION_CODE_POINTS)).ok, true);
  assert.equal(validateDescription('a'.repeat(MAX_DESCRIPTION_CODE_POINTS + 1)).reason, 'description-too-long');
  assert.equal(validateLink(`https://example.com/${'a'.repeat(MAX_LINK_CODE_POINTS - 20)}`).ok, true);
  assert.equal(validateLink(`https://example.com/${'a'.repeat(MAX_LINK_CODE_POINTS)}`).reason, 'link-too-long');
  assert.equal(validateLink('ftp://example.com/a').reason, 'link-scheme');
  assert.equal(validateLink('https://').reason, 'link-invalid');
});
test('file/web-link schema, legacy edit, and rename preserve attachment metadata', () => {
  const fileAttachment = {
    attachmentId: 'att-x', originalName: 'A.md', sizeBytes: 12, mime: 'text/markdown',
    classification: { format: 'markdown', badge: 'MD', confidence: 'extension', needsReview: false, reason: 'markdown-extension' }
  };
  const command = buildAddChildCommand({
    tree: baseTree(), parentId: 'r', kind: 'file', draftName: 'File', draftDescription: 'Body',
    draftDataType: 'file', draftAttachment: fileAttachment,
    datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0
  });
  assert.equal(command.ok, true);
  const node = command.candidateTree.children.at(-1);
  assert.equal(node.data.dataType, 'file');
  assert.equal(node.data.link, undefined);
  assert.equal(node.data.attachmentId, 'att-x');
  assert.equal(node.data.classification.badge, 'MD');

  const tree = baseTree();
  tree.children[0].children[0].data = { dataType: 'file', description: 'old', attachmentId: 'att-x', originalName: 'A.md', sizeBytes: 12, mime: 'text/markdown', classification: fileAttachment.classification };
  const metadata = buildMetadataCommand({ tree, targetId: 'x', description: 'new', link: null, linkProvided: false, datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  assert.equal(metadata.ok, true);
  assert.equal(metadata.candidateTree.children[0].children[0].data.attachmentId, 'att-x');
  assert.equal(metadata.candidateTree.children[0].children[0].data.link, undefined);

  const rename = buildRenameCommand({ tree, targetId: 'x', draftName: 'New display', datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  assert.equal(rename.candidateTree.children[0].children[0].data.attachmentId, 'att-x');
  assert.equal(rename.candidateTree.children[0].children[0].data.originalName, 'A.md');
  assert.equal(rename.candidateTree.children[0].children[0].name, 'New display');

  const legacy = baseTree();
  const legacyResult = buildMetadataCommand({ tree: legacy, targetId: 'x', description: 'legacy edit', link: 'https://example.com/x', datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  assert.equal(legacyResult.candidateTree.children[0].children[0].data.dataType, undefined);
  assert.equal(legacyResult.candidateTree.children[0].children[0].data.link, 'https://example.com/x');
});
test('new data requires description, type, and the selected type payload', () => {
  const base = { tree: baseTree(), parentId: 'r', kind: 'file', draftName: 'New' };
  assert.equal(validateAddChild({ ...base, draftDescription: '   ', draftDataType: 'web-link', draftLink: 'https://example.com/a' }).reason, 'description-required');
  assert.equal(validateAddChild({ ...base, draftDescription: 'Body', draftLink: 'https://example.com/a' }).reason, 'data-type-required');
  assert.equal(validateAddChild({ ...base, draftDescription: 'Body', draftDataType: 'web-link' }).reason, 'link-required');
  assert.equal(validateAddChild({ ...base, draftDescription: 'Body', draftDataType: 'file' }).reason, 'attachment-missing');
  const folder = validateAddChild({ tree: baseTree(), parentId: 'r', kind: 'folder', draftName: 'Folder', draftDescription: 'ignored', draftLink: 'https://example.com' });
  assert.equal(folder.ok, true);
  assert.equal(folder.dataType, null);
  assert.equal(folder.link, null);
});
test('typed metadata edits require description and web URL; legacy remains optional', () => {
  const tree = baseTree();
  tree.children[0].children[0].data = {
    dataType: 'file', description: 'old', attachmentId: 'att-1', originalName: 'A.md', sizeBytes: 4, mime: 'text/markdown',
    classification: { format: 'markdown', badge: 'MD', needsReview: false }
  };
  assert.equal(validateMetadataEdit({ tree, targetId: 'x', description: '   ', link: null, linkProvided: false }).reason, 'description-required');
  const web = baseTree();
  web.children[0].children[0].data = { dataType: 'web-link', description: 'old', link: 'https://example.com/a' };
  assert.equal(validateMetadataEdit({ tree: web, targetId: 'x', description: 'new', link: '', linkProvided: true }).reason, 'link-required');
  assert.equal(validateMetadataEdit({ tree: web, targetId: 'x', description: '', link: 'https://example.com/a', linkProvided: true }).reason, 'description-required');
  assert.equal(validateMetadataEdit({ tree: web, targetId: 'x', description: 'new', link: 'https://example.com/b', linkProvided: true }).ok, true);
  const legacy = baseTree();
  assert.equal(validateMetadataEdit({ tree: legacy, targetId: 'b', description: '', link: '', linkProvided: true }).ok, true);
});
test('Edit Folder and Edit Data enforce the 300-node admission before no-op or candidate preparation', () => {
  const at300 = baseTree(300);
  assert.equal(validateFolderEdit({ tree: at300, targetId: 'a', draftName: 'Alpha renamed' }).ok, true);
  assert.equal(validateDataEdit({ tree: at300, targetId: 'x', draftName: 'Data renamed', description: 'old', link: 'https://old.example/path' }).ok, true);
  const folder300 = buildEditFolderCommand({ tree: at300, targetId: 'a', draftName: 'Alpha renamed', draftDescription: 'body', datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  const data300 = buildEditDataCommand({ tree: at300, targetId: 'x', draftName: 'Data renamed', description: 'new', link: 'https://old.example/path', datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  assert.equal(folder300.ok, true);
  assert.equal(data300.ok, true);
  assert.equal(folder300.candidateTree.children[0].name, 'Alpha renamed');
  assert.equal(at300.children[0].name, 'Alpha');  const at301 = baseTree(301);
  assert.equal(validateFolderEdit({ tree: at301, targetId: 'a', draftName: 'Alpha renamed' }).reason, 'editor-node-limit');
  assert.equal(validateDataEdit({ tree: at301, targetId: 'x', draftName: 'Data renamed', description: 'old', link: 'https://old.example/path' }).reason, 'editor-node-limit');
  assert.equal(validateFolderEdit({ tree: at301, targetId: 'a', draftName: 'Alpha', draftDescription: null }).reason, 'editor-node-limit');
  assert.equal(validateDataEdit({ tree: at301, targetId: 'x', draftName: 'Data', description: 'old', link: 'https://old.example/path' }).reason, 'editor-node-limit');
  const folderCommand = buildEditFolderCommand({ tree: at301, targetId: 'a', draftName: 'Alpha renamed', draftDescription: 'body', datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  const dataCommand = buildEditDataCommand({ tree: at301, targetId: 'x', draftName: 'Data renamed', description: 'new', link: 'https://old.example/path', datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0 });
  assert.equal(folderCommand.reason, 'editor-node-limit');
  assert.equal(dataCommand.reason, 'editor-node-limit');
  assert.equal(folderCommand.candidateTree, undefined);
  assert.equal(dataCommand.candidateTree, undefined);
  assert.equal(at301.children[0].name, 'Alpha');
  assert.equal(at301.children[0].children[0].name, 'Data');
});
test('Edit Folder/Data installation rejects 301 nodes before frame or commit and changes no revision', () => {
  const tree = baseTree(301);
  let frames = 0;
  let commits = 0;
  let revision = 0;
  const common = {
    tree, graph: {}, baseLayout: {}, model: {}, session: {}, structuralRootId: 'r',
    datasetToken: 1, baseRevision: 0, expectedDatasetToken: 1, expectedRevision: 0,
    viewport, baseRadiusCss: 198.66,
    frame: () => { frames += 1; throw new Error('must not frame'); },
    setCandidateEnv: () => {},
    commit: () => { commits += 1; revision += 1; },
    recover: () => false
  };
  const folder = performEditFolderInstallation({ ...common, targetId: 'a', draftName: 'Alpha renamed', draftDescription: 'body' });
  const data = performEditDataInstallation({ ...common, targetId: 'x', draftName: 'Data renamed', description: 'new', link: 'https://old.example/path' });
  assert.equal(folder.reason, 'editor-node-limit');
  assert.equal(data.reason, 'editor-node-limit');
  assert.equal(frames, 0);
  assert.equal(commits, 0);
  assert.equal(revision, 0);
  assert.equal(tree.children[0].name, 'Alpha');
  assert.equal(tree.children[0].children[0].name, 'Data');
});




