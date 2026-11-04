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
  installSelectionFrame,
  redrawSelectionFrame
} from '../../../src/engine/hypertree/interaction/index.js';
import {
  applyCameraToScene,
  cameraForward,
  cameraInverse,
  createCamera,
  normalizeWheelDelta,
  resetCamera,
  wheelZoomFactor,
  zoomCameraAt
} from '../../../src/engine/hypertree/navigation/index.js';
import { createMouseNavigationController } from '../../../src/engine/hypertree/navigation/index.js';
import { f20, f200 } from '../../engine/layout/fixtures.mjs';

const host = document.querySelector('#graph-host');
const statusEl = document.querySelector('#status');
const fixtureEl = document.querySelector('#fixture');
const phaseEl = document.querySelector('#phase');
const dprEl = document.querySelector('#dpr-source');
let surface = null;
let overlay = null;
let controller = null;
let navigation = null;
let projection = null;
let scene = null;
let baseStaged = null;
let baseView = null;
let displayedFocusView = null;
let graph = null;
let presentation = null;
let camera = createCamera();
let requestedCamera = createCamera();
let displayedCamera = createCamera();
let cameraOperation = null;
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
  'readme.md', 'manual.PDF', 'notes.txt', 'photo.png', 'archive.tar.gz',
  'mystery.bin', 'résumé.md', '<img src=x onerror=alert(1)>.md',
  'LICENSE', 'settings.JSON'
];

function actualDpr() { return Number(window.devicePixelRatio) || 1; }
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
  return { width: Math.max(0, Math.floor(host.clientWidth - padX)), height: Math.max(0, Math.floor(host.clientHeight - padY)) };
}
function makeProjection(metrics) {
  return createProjection({ width: metrics.cssWidth, height: metrics.cssHeight, radius: Math.max(1, Math.min(metrics.cssWidth, metrics.cssHeight) * 0.42) });
}
function buildPresentation() {
  const result = new Map();
  let fileIndex = 0;
  for (const [id, node] of graph.nodes) {
    if (node.kind === 'folder') result.set(id, { name: id === 'n0' ? 'Projects' : `Folder ${id}`, kind: 'folder' });
    else {
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
  const loaded = loadTree(fixtures[fixtureEl.value]());
  graph = loaded.graph;
  baseStaged = computeRadialLayout(graph, { rootId: 'n0', phases: ['current', 'start', 'end'], nodeOptions: { overridable: true }, radius: 100, offset: 0.1 });
  presentation = buildPresentation();
  baseView = createFocusView(baseStaged, { focusId: null, phase: phaseEl.value });
}
function prepareScene(view) {
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  return prepareGraphScene(view.staged, { phase: phaseEl.value, projection, nodeDims, nodeKinds });
}
function viewport() {
  const m = surface.getMetrics();
  return { width: m.cssWidth, height: m.cssHeight };
}
function numericalProbe() {
  if (!scene) return null;
  const node = [...scene.nodes.values()].find((n) => n.visible && n.radius > 0);
  if (!node) return null;
  const snapshot = createHitSnapshot(scene);
  return {
    kind: 'numerical-probe',
    hit: hitTestNode(snapshot, { x: node.center.x, y: node.center.y }),
    point: { x: node.center.x, y: node.center.y },
    expected: node.id
  };
}
function coordinateProbe() {
  if (!scene) return null;
  const vp = viewport();
  const world = cameraInverse(camera, { x: vp.width / 2, y: vp.height / 2 }, vp);
  const screen = cameraForward(camera, world, vp);
  return {
    kind: 'numerical-coordinate-probe',
    roundTripError: { x: screen.x - vp.width / 2, y: screen.y - vp.height / 2 }
  };
}
function focusState() {
  if (displayedFocusId !== null) return 'displayed';
  if (requestedFocusId !== null) return 'pending';
  return 'base';
}
function updateStatus(operation, drawResult, labels, metrics, preserved) {
  const navState = navigation ? navigation.getState() : null;
  const controllerState = controller && !lastError ? controller.getState() : null;
  const status = {
    harness: 'm5-navigation',
    browserVerification: 'HARNESS_LOADED',
    note: 'Desktop mouse navigation only; no touch/keyboard/inertia/opening/file access.',
    operation,
    fixture: fixtureEl.value,
    phase: phaseEl.value,
    generation,
    actualDpr: actualDpr(),
    selectedDpr: selectedDpr().dpr,
    syntheticDpr: dprEl.value === 'actual' ? null : Number(dprEl.value),
    dprSource: dprEl.value === 'actual' ? 'actual' : 'synthetic',
    viewport: metrics ? { width: metrics.cssWidth, height: metrics.cssHeight } : null,
    backing: metrics ? { width: metrics.backingWidth, height: metrics.backingHeight } : null,
    requestedCamera,
    displayedCamera,
    cameraOperation,
    camera,
    selectedId,
    requestedFocusId,
    displayedFocusId,
    focusState: focusState(),
    navigation: navState ? {
      dragging: navState.dragging,
      captureOwned: navState.captureOwned,
      suppressNextClick: navState.suppressNextClick,
      lastEvent: navState.lastEvent,
      error: navState.error
    } : null,
    expected: graph ? { nodes: graph.nodes.size, edges: graph.nodes.size - 1 } : null,
    prepared: scene ? { nodes: scene.nodeCount, edges: scene.edgeCount } : null,
    drawn: drawResult ? { nodes: drawResult.drawnNodes, edges: drawResult.drawnEdges, selectionDrawn: drawResult.selectionDrawn } : null,
    labels: labels ? {
      candidateCount: labels.candidateCount, createdCount: labels.createdCount,
      visibleCount: labels.visibleCount, suppressedCount: labels.suppressedCount,
      overlapSuppressedCount: labels.overlapSuppressedCount,
      viewportSuppressedCount: labels.viewportSuppressedCount,
      textMismatchCount: labels.textMismatchCount
    } : null,
    controller: controllerState,
    lastUserEvent,
    lastProgrammaticEvent,
    numericalProbe: numericalProbe(),
    coordinateProbe: coordinateProbe(),
    lifecycle: {
      surface: surface ? 'alive' : 'destroyed',
      overlay: overlay ? 'alive' : 'destroyed',
      controller: controller ? 'alive' : 'destroyed',
      navigation: navigation ? 'alive' : 'destroyed'
    },
    error: lastError
  };
  window.__M5_NAVIGATION_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
}

function drawCameraFrame(operation, view, nextCamera, preserved) {
  if (!surface || !overlay || !controller || !navigation) return false;
  const metrics = surface.getMetrics();
  const selectionBefore = selectedId;
  const nextGeneration = generation + 1;
  requestedCamera = nextCamera;
  cameraOperation = operation;
  lastError = null;
  transitioning = true;
  try {
    controller.invalidate();
    projection = makeProjection(metrics);
    const baseScene = prepareScene(view);
    const cameraScene = applyCameraToScene(baseScene, nextCamera, projection);
    const installation = installSelectionFrame(controller, {
      scene: cameraScene,
      generation: nextGeneration,
      selectedId: selectionBefore,
      draw() {
        const drawResult = drawGraphScene(surface, cameraScene, { selectedId: selectionBefore });
        const labels = overlay.update({ scene: cameraScene, presentation });
        return { drawResult, labels };
      }
    });
    scene = cameraScene;
    displayedFocusView = view;
    displayedFocusId = view.requestedId;
    camera = nextCamera;
    displayedCamera = nextCamera;
    generation = nextGeneration;
    selectedId = installation.state.selectedId;
    navigation.update({ camera, viewport: { width: metrics.cssWidth, height: metrics.cssHeight } });
    updateStatus(
      operation,
      installation.drawResult.drawResult,
      installation.drawResult.labels,
      metrics,
      preserved
    );
    return true;
  } catch (error) {
    scene = null;
    displayedCamera = null;
    lastError = { name: error.name, code: error.code, message: error.message };
    try { controller.invalidate(); } catch { /* preserve original failure */ }
    updateStatus(operation, null, null, metrics, preserved);
    return false;
  } finally {
    transitioning = false;
  }
}

function renderImmediateFocus(operation, focusId, preserved) {
  const nextView = createFocusView(baseStaged, { focusId, phase: phaseEl.value });
  requestedFocusId = focusId;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: operation };
  return drawCameraFrame(operation, nextView, resetCamera(), preserved);
}
function cameraFrameFromNavigation(nextCamera, meta) {
  if (!displayedFocusView) return false;
  const ok = drawCameraFrame(meta.kind, displayedFocusView, nextCamera, true);
  if (!ok) throw lastError || new Error('camera frame failed');
  return true;
}

function zoomButtons(factor) {
  const vp = viewport();
  const next = zoomCameraAt(camera, factor, { x: vp.width / 2, y: vp.height / 2 }, vp);
  requestedCamera = next;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'zoom-button', reason: factor > 1 ? 'zoom-in' : 'zoom-out' };
  if (!drawCameraFrame(factor > 1 ? 'zoom-in' : 'zoom-out', displayedFocusView || baseView, next, true)) {
    lastError = lastError || { code: 'camera-failed', message: 'zoom failed' };
  }
}

function resetCameraView() {
  lastProgrammaticEvent = { kind: 'programmatic', source: 'camera-reset', reason: 'reset-camera' };
  drawCameraFrame('reset-camera', displayedFocusView || baseView, resetCamera(), true);
}

function focusSelected() {
  if (!selectedId) {
    lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'no-selection' };
    updateStatus('focus', null, null, surface ? surface.getMetrics() : null, true);
    return;
  }
  renderImmediateFocus('focus', selectedId, true);
}

function resetFocus() {
  requestedFocusId = null;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'reset-focus' };
  drawCameraFrame('reset-focus', baseView, resetCamera(), true);
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
  if (transitioning || !scene || !surface || !overlay) return;
  const metrics = surface.getMetrics();
  const redraw = redrawSelectionFrame({
    controller,
    draw() {
      const drawResult = drawGraphScene(surface, scene, { selectedId: event.selectedId });
      const labels = overlay.update({ scene, presentation });
      return { drawResult, labels };
    },
    onCleanupStart() { transitioning = true; },
    onCleanupEnd() { transitioning = false; }
  });
  if (!redraw.ok) {
    selectedId = null;
    lastError = {
      name: redraw.error.name,
      code: redraw.error.code,
      message: redraw.error.message
    };
    updateStatus('selection-failed', null, null, metrics, true);
    return;
  }
  selectedId = event.selectedId;
  updateStatus('selection', redraw.result.drawResult, redraw.result.labels, metrics, true);
}

function createAll(operation) {
  const size = hostContentSize();
  const choice = selectedDpr();
  try {
    surface = createCanvasSurface(host, { width: size.width, height: size.height, dpr: choice.dpr });
    overlay = createLabelOverlay(host, { maxLabels: 40, maxWidth: 160 });
    controller = createSelectionController(surface.canvas, { onChange: selectionChanged });
    projection = makeProjection(surface.getMetrics());
    navigation = createMouseNavigationController(surface.canvas, {
      viewport: viewport(),
      camera: resetCamera(),
      onCameraChange: cameraFrameFromNavigation,
      onDragStart: () => {
        lastProgrammaticEvent = { kind: 'programmatic', source: 'navigation', reason: 'drag-start' };
      },
      onError: (event) => {
        lastError = { name: event.error.name, code: event.error.code, message: event.error.message };
        try { controller.invalidate(); } catch { /* preserve original failure */ }
        updateStatus('navigation-error', null, null, surface ? surface.getMetrics() : null, true);
      }
    });
    commitFixture();
    camera = resetCamera();
    requestedCamera = camera;
    displayedCamera = camera;
    displayedFocusView = baseView;
    displayedFocusId = null;
    requestedFocusId = null;
    selectedId = null;
    lastUserEvent = null;
    lastProgrammaticEvent = null;
    drawCameraFrame(operation, baseView, resetCamera(), false);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus(operation, null, null, surface ? surface.getMetrics() : null, false);
  }
}

function resizeAll() {
  if (!surface || !navigation) { createAll('create'); return; }
  const before = surface.canvas;
  const selectionBefore = selectedId;
  const focusView = displayedFocusView || baseView;
  const currentCamera = camera;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'resize', reason: 'resize' };
  try {
    surface.resize({ width: hostContentSize().width, height: hostContentSize().height, dpr: selectedDpr().dpr });
    selectedId = selectionBefore;
    drawCameraFrame('resize', focusView, currentCamera, surface.canvas === before);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('resize', null, null, surface.getMetrics(), surface.canvas === before);
  }
}

function clearSelection() {
  if (controller && controller.getState().selectedId !== null) controller.clear();
}

function resetReplacement(operation) {
  requestedFocusId = null;
  displayedFocusId = null;
  displayedFocusView = baseView;
  selectedId = null;
  camera = resetCamera();
  requestedCamera = camera;
  displayedCamera = camera;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'replacement', reason: operation };
  drawCameraFrame(operation, baseView, camera, true);
}

function destroyAll() {
  if (navigation) navigation.destroy();
  if (controller) controller.destroy();
  if (overlay) overlay.destroy();
  if (surface) surface.destroy();
  navigation = null;
  controller = null;
  overlay = null;
  surface = null;
  projection = null;
  scene = null;
  baseView = null;
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

document.querySelector('#zoom-in').addEventListener('click', () => zoomButtons(1.25));
document.querySelector('#zoom-out').addEventListener('click', () => zoomButtons(0.8));
document.querySelector('#reset-camera').addEventListener('click', resetCameraView);
document.querySelector('#focus-selected').addEventListener('click', focusSelected);
document.querySelector('#reset-focus').addEventListener('click', resetFocus);
document.querySelector('#clear').addEventListener('click', clearSelection);
document.querySelector('#resize').addEventListener('click', resizeAll);
document.querySelector('#recreate').addEventListener('click', recreateAll);
document.querySelector('#destroy').addEventListener('click', destroyAll);
fixtureEl.addEventListener('change', () => { if (surface) destroyAll(); createAll('fixture'); });
phaseEl.addEventListener('change', () => { if (surface) resetReplacement('phase'); });
dprEl.addEventListener('change', resizeAll);

createAll('create');


