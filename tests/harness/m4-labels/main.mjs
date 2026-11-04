import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createCanvasSurface,
  createLabelOverlay,
  createProjection,
  drawGraphScene,
  prepareGraphScene
} from '../../../src/engine/hypertree/render/index.js';
import { f20, f200 } from '../../engine/layout/fixtures.mjs';

const host = document.querySelector('#graph-host');
const statusEl = document.querySelector('#status');
const fixtureEl = document.querySelector('#fixture');
const phaseEl = document.querySelector('#phase');
const dprEl = document.querySelector('#dpr-source');
let surface = null;
let overlay = null;
let projection = null;
let scene = null;
let staged = null;
let graph = null;
let presentation = null;
let lastError = null;

const fixtures = { f20, f200 };
const FILE_NAMES = [
  'readme.md',
  'manual.PDF',
  'notes.txt',
  'photo.png',
  'archive.tar.gz',
  'mystery.bin',
  'résumé.md',
  '<img src=x onerror=alert(1)>.md',
  'LICENSE',
  'settings.JSON'
];

function actualDpr() {
  return Number(window.devicePixelRatio) || 1;
}

function selectedDpr() {
  const value = dprEl.value;
  return value === 'actual'
    ? { dpr: actualDpr(), source: 'actual' }
    : { dpr: Number(value), source: 'synthetic' };
}

function hostContentSize() {
  const style = getComputedStyle(host);
  const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  return {
    width: Math.max(0, Math.floor(host.clientWidth - padX)),
    height: Math.max(0, Math.floor(host.clientHeight - padY))
  };
}

function makeProjection(metrics) {
  return createProjection({
    width: metrics.cssWidth,
    height: metrics.cssHeight,
    radius: Math.max(1, Math.min(metrics.cssWidth, metrics.cssHeight) * 0.42)
  });
}

function buildPresentation() {
  const result = new Map();
  let fileIndex = 0;
  for (const [id, node] of graph.nodes) {
    if (node.kind === 'folder') {
      result.set(id, { name: id === 'n0' ? 'Projects' : `Folder ${id}`, kind: 'folder' });
    } else {
      const name = FILE_NAMES[fileIndex % FILE_NAMES.length];
      const entry = { name, kind: 'file' };
      if (name === 'mystery.bin') entry.typeHint = 'generic';
      result.set(id, entry);
      fileIndex += 1;
    }
  }
  return result;
}

function commitFixture() {
  const tree = fixtures[fixtureEl.value]();
  const loaded = loadTree(tree);
  graph = loaded.graph;
  staged = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  presentation = buildPresentation();
}

function prepareScene() {
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  return prepareGraphScene(staged, {
    phase: phaseEl.value,
    projection,
    nodeDims,
    nodeKinds
  });
}

function updateStatus(operation, drawResult, labels, metrics, preserved) {
  const status = {
    harness: 'm4-labels',
    browserVerification: 'HARNESS_LOADED',
    note: 'Static labels/icons only; not complete accessible navigation or file preview.',
    operation,
    fixture: fixtureEl.value,
    phase: phaseEl.value,
    actualDpr: actualDpr(),
    selectedDpr: selectedDpr().dpr,
    syntheticDpr: dprEl.value === 'actual' ? null : Number(dprEl.value),
    dprSource: dprEl.value === 'actual' ? 'actual' : 'synthetic',
    canvasIdentityPreserved: preserved,
    content: metrics ? { width: metrics.cssWidth, height: metrics.cssHeight } : null,
    backing: metrics ? { width: metrics.backingWidth, height: metrics.backingHeight } : null,
    expected: graph ? { nodes: graph.nodes.size, edges: graph.nodes.size - 1 } : null,
    requested: graph ? { nodes: graph.nodes.size, edges: graph.nodes.size - 1 } : null,
    prepared: scene ? { nodes: scene.nodeCount, edges: scene.edgeCount } : null,
    drawn: drawResult ? { nodes: drawResult.drawnNodes, edges: drawResult.drawnEdges } : null,
    labels: labels ? {
      candidateCount: labels.candidateCount,
      createdCount: labels.createdCount,
      visibleCount: labels.visibleCount,
      suppressedCount: labels.suppressedCount,
      overlapSuppressedCount: labels.overlapSuppressedCount,
      viewportSuppressedCount: labels.viewportSuppressedCount,
      measuredCount: labels.measuredCount,
      visibleIconCount: labels.visibleIconCount,
      textMismatchCount: labels.textMismatchCount,
      measurement: labels.measurement,
      viewport: labels.viewport,
      dprIndependent: labels.dprIndependent
    } : null,
    lifecycle: { surface: surface ? 'alive' : 'destroyed', overlay: overlay ? 'alive' : 'destroyed' },
    error: lastError
  };
  window.__M4_LABELS_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
}

function draw(operation, preserved) {
  if (!surface || !staged) return;
  lastError = null;
  const metrics = surface.getMetrics();
  projection = makeProjection(metrics);
  scene = prepareScene();
  const drawResult = drawGraphScene(surface, scene);
  const labels = overlay.update({ scene, presentation });
  updateStatus(operation, drawResult, labels, metrics, preserved);
}

function createAll(operation) {
  lastError = null;
  const size = hostContentSize();
  const choice = selectedDpr();
  try {
    surface = createCanvasSurface(host, { width: size.width, height: size.height, dpr: choice.dpr });
    overlay = createLabelOverlay(host, { maxLabels: 40, maxWidth: 160 });
    commitFixture();
    draw(operation, false);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus(operation, null, null, surface ? surface.getMetrics() : null, false);
  }
}

function resizeAll() {
  if (!surface || !overlay) {
    createAll('create');
    return;
  }
  const before = surface.canvas;
  const size = hostContentSize();
  const choice = selectedDpr();
  lastError = null;
  try {
    surface.resize({ width: size.width, height: size.height, dpr: choice.dpr });
    draw('resize', surface.canvas === before);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('resize', null, null, surface.getMetrics(), surface.canvas === before);
  }
}

function destroyAll() {
  if (overlay) overlay.destroy();
  if (surface) surface.destroy();
  overlay = null;
  surface = null;
  projection = null;
  scene = null;
  updateStatus('destroy', null, null, null, false);
}

function recreateAll() {
  destroyAll();
  createAll('recreate');
}

document.querySelector('#resize').addEventListener('click', resizeAll);
document.querySelector('#recreate').addEventListener('click', recreateAll);
document.querySelector('#destroy').addEventListener('click', destroyAll);
fixtureEl.addEventListener('change', recreateAll);
phaseEl.addEventListener('change', () => {
  if (!surface || !overlay) return;
  try {
    draw('phase', true);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('phase', null, null, surface.getMetrics(), true);
  }
});
dprEl.addEventListener('change', resizeAll);

createAll('create');
