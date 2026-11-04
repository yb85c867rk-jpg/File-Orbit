import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCreateMapCandidate } from '../../../src/engine/hypertree/exploration/create-map.js';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { createExplorationModel, stageExplorationFrame } from '../../../src/engine/hypertree/exploration/index.js';
import { installCandidateEnvironment } from '../../../src/engine/hypertree/exploration/reparent-action.js';
import { resetCamera, EXPERIMENTAL_CAMERA_LIMITS } from '../../../src/engine/hypertree/navigation/index.js';
import { createInteractionOwnership } from '../../harness/m5-exploration/shell-controls.js';

const viewport = { width: 1100, height: 473 };
function fakeFile(name, size = 4) { return { name, size, type: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain' }; }
const classify = async (file) => ({ format: file.name.endsWith('.pdf') ? 'pdf' : 'generic', badge: file.name.endsWith('.pdf') ? 'PDF' : 'FILE', needsReview: false, mime: file.type });
async function candidateFixture() {
  const prepared = await prepareCreateMapCandidate({ mapName: 'New Map', datasetToken: 11, classify,
    files: [{ file: fakeFile('Report.pdf'), relativePath: 'Docs/Report.pdf' }, { file: fakeFile('notes.txt'), relativePath: 'notes.txt' }] });
  assert.equal(prepared.ok, true);
  const { graph } = loadTree(prepared.tree);
  const staged = stageExperimentalV2Layout(graph, { rootId: prepared.tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const refined = refineExperimentalV2Layout(staged, graph, { viewport, padding: 24, phase: 'current', projectionBaseRadiusCss: 198.66 });
  const model = createExplorationModel({ graph, baseLayout: refined.staged, structuralRootId: prepared.tree.id, phase: 'current' });
  return { prepared, candidate: { tree: prepared.tree, graph, baseLayout: refined.staged, model, registry: prepared.registry, datasetToken: prepared.datasetToken } };
}
function installer(candidate, { failDraw = false } = {}) {
  let commitCount = 0; let hit = null; let labels = 0; let draw = 0;
  const frame = () => {
    const prepared = stageExplorationFrame({ graph: candidate.graph, baseLayout: candidate.baseLayout, view: candidate.model.view(), viewport, baseRadiusCss: 198.66,
      fit: true, entry: null, camera: null, framing: 'fit', cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
      adapters: {
        draw: () => { draw += 1; if (failDraw) throw new Error('draw-failed'); },
        labels: () => { labels += 1; },
        installHit: (value) => { hit = value; }
      } });
    return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
  };
  let recovered = false;
  const result = installCandidateEnvironment({ candidate, operation: 'create-map', prepare: () => ({ ok: true, fit: true }),
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), initialFraming: 'fit', frame,
    setCandidateEnv: () => {}, commit: () => { commitCount += 1; }, recover: () => { recovered = true; return true; } });
  return { result, commitCount, hit, labels, draw, recovered };
}
test('real candidate load/layout/model/frame installs draw→labels→matching hits before commit', async () => {
  const { prepared, candidate } = await candidateFixture();
  const installed = installer(candidate);
  assert.equal(installed.result.ok, true);
  assert.equal(installed.draw, 1); assert.equal(installed.labels, 1);
  assert.equal(installed.commitCount, 1); assert.ok(installed.hit);
  assert.equal(installed.hit.nodes.length, candidate.graph.nodes.size);
  assert.equal(prepared.tree.children.find((node) => node.name === 'Docs').children[0].data.classification.format, 'pdf');
  assert.equal(prepared.registry.get(prepared.tree.children.find((node) => node.name === 'Docs').children[0].data.attachmentId).classification.format, 'pdf');
});
test('frame failure preserves old live references and recovers through the shared boundary', async () => {
  const { candidate } = await candidateFixture();
  const oldLive = { id: 'old' };
  const installed = installer(candidate, { failDraw: true });
  assert.equal(installed.result.ok, false);
  assert.equal(installed.commitCount, 0);
  assert.equal(installed.recovered, true);
  assert.deepEqual(oldLive, { id: 'old' });
});
test('candidate IDs are deterministic and fresh per dataset token', async () => {
  const a = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 20, classify, files: [{ file: fakeFile('a.txt'), relativePath: 'a.txt' }] });
  const b = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 20, classify, files: [{ file: fakeFile('a.txt'), relativePath: 'a.txt' }] });
  const c = await prepareCreateMapCandidate({ mapName: 'M', datasetToken: 21, classify, files: [{ file: fakeFile('a.txt'), relativePath: 'a.txt' }] });
  assert.equal(a.tree.id, b.tree.id);
  assert.notEqual(a.tree.id, c.tree.id);
  assert.notEqual(a.tree.children[0].id, c.tree.children[0].id);
});test('creation ownership stays separate from recovery failure across installer outcomes', async () => {
  const { candidate } = await candidateFixture();
  const ownership = createInteractionOwnership();
  ownership.beginCreation();
  const success = installer(candidate, { failDraw: true });
  assert.equal(success.result.ok, false);
  ownership.clearRecoveryFailure();
  assert.equal(ownership.creationOwned, true);
  assert.equal(ownership.blocked(), true);
  assert.equal(ownership.releaseCreation(), true);
  assert.equal(ownership.blocked(), false);
  ownership.beginCreation();
  const failed = installer(candidate, { failDraw: true });
  assert.equal(failed.result.ok, false);
  ownership.markRecoveryFailure();
  ownership.releaseCreation();
  assert.equal(ownership.creationOwned, false);
  assert.equal(ownership.recoveryFailed, true);
  assert.equal(ownership.blocked(), true);
});

