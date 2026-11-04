import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import { createFocusView } from '../../../src/engine/hypertree/focus/index.js';
import {
  createCanvasSurface,
  createLabelOverlay,
  createProjection,
  drawGraphScene,
  prepareGraphScene
} from '../../../src/engine/hypertree/render/index.js';
import {
  createHitSnapshot,
  createSelectionController,
  hitTestNode,
  installSelectionFrame
} from '../../../src/engine/hypertree/interaction/index.js';
import { f20, f200 } from '../../engine/layout/fixtures.mjs';
import { focusCoordinateEvidence } from './evidence.mjs';

const host = document.querySelector('#graph-host');
const statusEl = document.querySelector('#status');
const fixtureEl = document.querySelector('#fixture');
const phaseEl = document.querySelector('#phase');
const dprEl = document.querySelector('#dpr-source');
let surface = null;
let overlay = null;
let controller = null;
let projection = null;
let scene = null;
let baseStaged = null;
let focusedView = null;
let displayedFocusView = null;
let graph = null;
let presentation = null;
let selectedId = null;
let requestedFocusId = null;
let displayedFocusId = null;
let generation = 0;
let lastUserEvent = null;
let lastProgrammaticEvent = null;
let lastError = null;
let transitioning = false;

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
  baseStaged = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  presentation = buildPresentation();
}

function prepareScene(staged) {
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  return prepareGraphScene(staged, {
    phase: phaseEl.value,
    projection,
    nodeDims,
    nodeKinds
  });
}

function numericalProbe() {
  if (!scene || !controller || controller.getState().nodeCount === 0) return null;
  const snapshot = createHitSnapshot(scene);
  const target = [...scene.nodes.values()].find((node) => node.visible && node.radius > 0);
  if (!target) return null;
  return {
    kind: 'numerical-probe',
    nodeId: hitTestNode(snapshot, { x: target.center.x, y: target.center.y }),
    point: { x: target.center.x, y: target.center.y },
    expectedNodeId: target.id
  };
}

function focusState() {
  if (displayedFocusId !== null) return 'focused';
  if (requestedFocusId !== null) return 'pending';
  return 'base';
}

function updateStatus(operation, drawResult, labels, metrics, preserved) {
  const selected = selectedId && scene ? scene.nodes.get(selectedId) : null;
  const selectedName = selectedId && presentation ? presentation.get(selectedId)?.name || null : null;
  const controllerState = controller && !lastError ? controller.getState() : null;
  const status = {
    harness: 'm5-focus',
    browserVerification: 'HARNESS_LOADED',
    note: 'Immediate focus only; no animation/focus-on-click/opening/touch/keyboard/file access.',
    operation,
    fixture: fixtureEl.value,
    phase: phaseEl.value,
    generation,
    actualDpr: actualDpr(),
    selectedDpr: selectedDpr().dpr,
    syntheticDpr: dprEl.value === 'actual' ? null : Number(dprEl.value),
    dprSource: dprEl.value === 'actual' ? 'actual' : 'synthetic',
    canvasIdentityPreserved: preserved,
    viewport: metrics ? { width: metrics.cssWidth, height: metrics.cssHeight } : null,
    backing: metrics ? { width: metrics.backingWidth, height: metrics.backingHeight } : null,
    selectedId,
    selectedName,
    requestedFocusId,
    displayedFocusId,
    focusState: focusState(),
    focusCoordinates: focusCoordinateEvidence(focusedView, displayedFocusView),
    expected: graph ? { nodes: graph.nodes.size, edges: graph.nodes.size - 1 } : null,
    prepared: scene ? { nodes: scene.nodeCount, edges: scene.edgeCount } : null,
    drawn: drawResult ? { nodes: drawResult.drawnNodes, edges: drawResult.drawnEdges, selectionDrawn: drawResult.selectionDrawn } : null,
    labels: labels ? {
      candidateCount: labels.candidateCount,
      createdCount: labels.createdCount,
      visibleCount: labels.visibleCount,
      suppressedCount: labels.suppressedCount,
      overlapSuppressedCount: labels.overlapSuppressedCount,
      viewportSuppressedCount: labels.viewportSuppressedCount,
      textMismatchCount: labels.textMismatchCount
    } : null,
    controller: controllerState,
    lastUserEvent,
    lastProgrammaticEvent,
    numericalProbe: numericalProbe(),
    lifecycle: {
      surface: surface ? 'alive' : 'destroyed',
      overlay: overlay ? 'alive' : 'destroyed',
      controller: controller ? 'alive' : 'destroyed'
    },
    error: lastError
  };
  window.__M5_FOCUS_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
}

function renderView(operation, focusId, preserved) {
  if (!surface || !baseStaged || !overlay || !controller) return;
  lastError = null;
  const metrics = surface.getMetrics();
  const selectionBefore = selectedId;
  transitioning = true;
  selectedId = null;
  let nextScene = null;
  let nextView = null;
  const nextGeneration = generation + 1;
  try {
    controller.invalidate();
    projection = makeProjection(metrics);
    nextView = createFocusView(baseStaged, { focusId, phase: phaseEl.value });
    nextScene = prepareScene(nextView.staged);
    const installation = installSelectionFrame(controller, {
      scene: nextScene,
      generation: nextGeneration,
      selectedId: selectionBefore,
      draw() {
        const drawResult = drawGraphScene(surface, nextScene, { selectedId: selectionBefore });
        const labels = overlay.update({ scene: nextScene, presentation });
        return { drawResult, labels };
      }
    });
    scene = nextScene;
    focusedView = nextView;
    displayedFocusView = nextView;
    generation = nextGeneration;
    displayedFocusId = focusId;
    selectedId = installation.state.selectedId;
    updateStatus(
      operation,
      installation.drawResult.drawResult,
      installation.drawResult.labels,
      metrics,
      preserved
    );
  } catch (error) {
    scene = null;
    focusedView = nextView;
    displayedFocusView = null;
    displayedFocusId = null;
    selectedId = null;
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus(operation, null, null, metrics, preserved);
  } finally {
    transitioning = false;
  }
}

function selectionChanged(event) {
  const clickDerived = event.reason === 'click' || event.reason === 'empty';
  const evidence = {
    kind: clickDerived ? 'user-click' : 'programmatic',
    source: 'selection-controller',
    selectedId: event.selectedId,
    previousId: event.previousId,
    reason: event.reason
  };
  if (clickDerived) lastUserEvent = evidence;
  else lastProgrammaticEvent = evidence;
  if (transitioning) return;
  if (!surface || !scene || !overlay) return;
  try {
    const metrics = surface.getMetrics();
    const drawResult = drawGraphScene(surface, scene, { selectedId: event.selectedId });
    const labels = overlay.update({ scene, presentation });
    selectedId = event.selectedId;
    updateStatus('selection', drawResult, labels, metrics, true);
  } catch (error) {
    transitioning = true;
    selectedId = null;
    try {
      controller.invalidate();
    } catch {
      // Preserve the original drawing failure.
    } finally {
      transitioning = false;
    }
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('selection', null, null, null, true);
  }
}

function createAll(operation) {
  const size = hostContentSize();
  const choice = selectedDpr();
  try {
    surface = createCanvasSurface(host, { width: size.width, height: size.height, dpr: choice.dpr });
    overlay = createLabelOverlay(host, { maxLabels: 40, maxWidth: 160 });
    controller = createSelectionController(surface.canvas, { onChange: selectionChanged });
    commitFixture();
    selectedId = null;
    requestedFocusId = null;
    displayedFocusId = null;
    focusedView = null;
    displayedFocusView = null;
    lastUserEvent = null;
    lastProgrammaticEvent = null;
    renderView(operation, null, false);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus(operation, null, null, surface ? surface.getMetrics() : null, false);
  }
}

function focusSelected() {
  if (!selectedId) {
    lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'no-selection' };
    updateStatus('focus', null, null, surface ? surface.getMetrics() : null, true);
    return;
  }
  requestedFocusId = selectedId;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'focus-request', selectedId };
  renderView('focus', requestedFocusId, true);
}

function resetFocus() {
  requestedFocusId = null;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'reset-focus' };
  renderView('reset-focus', null, true);
}

function resizeAll() {
  if (!surface || !overlay || !controller) {
    createAll('create');
    return;
  }
  const before = surface.canvas;
  const size = hostContentSize();
  const choice = selectedDpr();
  const focusToKeep = displayedFocusId;
  lastError = null;
  transitioning = true;
  try {
    controller.invalidate();
    requestedFocusId = focusToKeep;
    lastProgrammaticEvent = { kind: 'programmatic', source: 'resize', reason: 'invalidate' };
  } finally {
    transitioning = false;
  }
  try {
    surface.resize({ width: size.width, height: size.height, dpr: choice.dpr });
    renderView('resize', focusToKeep, surface.canvas === before);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('resize', null, null, surface.getMetrics(), surface.canvas === before);
  }
}

function clearSelection() {
  if (!controller) return;
  if (controller.getState().selectedId === null) return;
  controller.clear();
}

function destroyAll() {
  if (controller) controller.destroy();
  if (overlay) overlay.destroy();
  if (surface) surface.destroy();
  controller = null;
  overlay = null;
  surface = null;
  projection = null;
  scene = null;
  focusedView = null;
  displayedFocusView = null;
  selectedId = null;
  requestedFocusId = null;
  displayedFocusId = null;
  updateStatus('destroy', null, null, null, false);
}

function recreateAll() {
  destroyAll();
  createAll('recreate');
}

function resetForFixtureOrPhase(operation) {
  requestedFocusId = null;
  displayedFocusId = null;
  selectedId = null;
  lastUserEvent = null;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'replacement', reason: 'reset-focus-selection' };
  transitioning = true;
  try {
    controller.invalidate();
  } finally {
    transitioning = false;
  }
  renderView(operation, null, true);
}

document.querySelector('#focus-selected').addEventListener('click', focusSelected);
document.querySelector('#reset-focus').addEventListener('click', resetFocus);
document.querySelector('#clear').addEventListener('click', clearSelection);
document.querySelector('#resize').addEventListener('click', resizeAll);
document.querySelector('#recreate').addEventListener('click', recreateAll);
document.querySelector('#destroy').addEventListener('click', destroyAll);
fixtureEl.addEventListener('change', () => {
  if (!surface || !overlay || !controller) return;
  destroyAll();
  createAll('fixture');
});
phaseEl.addEventListener('change', () => {
  if (!surface || !overlay || !controller) return;
  resetForFixtureOrPhase('phase');
});
dprEl.addEventListener('change', resizeAll);

createAll('create');





