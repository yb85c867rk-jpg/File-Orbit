import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createCanvasSurface,
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
let projection = null;
let staged = null;
let graph = null;
let lastError = null;

const fixtures = { f20, f200 };

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
}

function sceneForPhase() {
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  return prepareGraphScene(staged, {
    phase: phaseEl.value,
    projection,
    nodeDims,
    nodeKinds
  });
}

function updateStatus(operation, result, metrics, preserved, scene) {
  const expectedEdges = graph ? graph.nodes.size - 1 : 0;
  const status = {
    harness: 'm4-graph',
    browserVerification: 'HARNESS_LOADED',
    note: 'Static nodes/hyperlines only; browser graph verification is manual.',
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
    expected: graph ? { nodes: graph.nodes.size, edges: expectedEdges } : null,
    requested: graph ? { nodes: graph.nodes.size, edges: expectedEdges } : null,
    prepared: scene ? { nodes: scene.nodeCount, edges: scene.edgeCount } : null,
    drawn: result ? { nodes: result.drawnNodes, edges: result.drawnEdges } : null,
    surface: surface ? 'alive' : 'destroyed',
    error: lastError
  };
  window.__M4_GRAPH_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
}

function draw(operation, preserved) {
  if (!surface || !staged) return;
  lastError = null;
  const metrics = surface.getMetrics();
  projection = makeProjection(metrics);
  const scene = sceneForPhase();
  const result = drawGraphScene(surface, scene);
  updateStatus(operation, result, metrics, preserved, scene);
}

function createSurface(operation) {
  if (surface) return;
  lastError = null;
  const size = hostContentSize();
  const choice = selectedDpr();
  try {
    surface = createCanvasSurface(host, { width: size.width, height: size.height, dpr: choice.dpr });
    if (!staged) commitFixture();
    draw(operation, false);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus(operation, null, null, false, null);
  }
}

function resizeSurface() {
  if (!surface) {
    createSurface('create');
    return;
  }
  const before = surface.canvas;
  const size = hostContentSize();
  const choice = selectedDpr();
  try {
    surface.resize({ width: size.width, height: size.height, dpr: choice.dpr });
    draw('resize', surface.canvas === before);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('resize', null, surface.getMetrics(), surface.canvas === before, null);
  }
}

function recreate() {
  if (surface) surface.destroy();
  surface = null;
  projection = null;
  staged = null;
  graph = null;
  commitFixture();
  createSurface('recreate');
}

function destroy() {
  if (surface) surface.destroy();
  surface = null;
  projection = null;
  updateStatus('destroy', null, null, false, null);
}

document.querySelector('#resize').addEventListener('click', resizeSurface);
document.querySelector('#recreate').addEventListener('click', recreate);
document.querySelector('#destroy').addEventListener('click', destroy);
fixtureEl.addEventListener('change', recreate);
phaseEl.addEventListener('change', () => draw('phase', true));
dprEl.addEventListener('change', resizeSurface);

commitFixture();
createSurface('create');

