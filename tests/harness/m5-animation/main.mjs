import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout } from '../../../src/engine/hypertree/layout/index.js';
import {
  createFocusAnimator,
  createFocusView,
  focusParameter
} from '../../../src/engine/hypertree/focus/index.js';
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
import { focusCoordinateEvidence } from '../m5-focus/evidence.mjs';

const host = document.querySelector('#graph-host');
const statusEl = document.querySelector('#status');
const fixtureEl = document.querySelector('#fixture');
const phaseEl = document.querySelector('#phase');
const dprEl = document.querySelector('#dpr-source');
const durationEl = document.querySelector('#duration');
let surface = null;
let overlay = null;
let controller = null;
let animation = null;
let projection = null;
let scene = null;
let baseStaged = null;
let graph = null;
let presentation = null;
let selectedId = null;
let selectedBeforeAnimation = null;
let requestedFocusId = null;
let displayedFocusId = null;
let displayedFocusView = null;
let lastFrameView = null;
let generation = 0;
let lastUserEvent = null;
let lastProgrammaticEvent = null;
let lastError = null;
let animationSkippedReason = null;
let transitioning = false;
let lastDrawResult = null;
let lastLabels = null;
let lastMetrics = null;

const fixtures = { f20, f200 };
const FILE_NAMES = [
  'readme.md', 'manual.PDF', 'notes.txt', 'photo.png', 'archive.tar.gz',
  'mystery.bin', 'résumé.md', '<img src=x onerror=alert(1)>.md',
  'LICENSE', 'settings.JSON'
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
  if (displayedFocusView && displayedFocusId !== null
      && (!animationRunning() || displayedFocusId === requestedFocusId)) return 'displayed';
  if (animation && animation.getState().state === 'running') return 'animating';
  if (requestedFocusId !== null) return 'pending';
  return 'base';
}

function updateStatus(operation, drawResult, labels, metrics, preserved) {
  const selected = selectedId && scene ? scene.nodes.get(selectedId) : null;
  const selectedName = selectedId && presentation ? presentation.get(selectedId)?.name || null : null;
  const controllerState = controller && !lastError ? controller.getState() : null;
  const animationState = animation ? animation.getState() : null;
  const status = {
    harness: 'm5-animation',
    browserVerification: 'HARNESS_LOADED',
    note: 'Animated focus only from explicit button; no focus-on-click/opening/touch/keyboard/file access.',
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
    selectedId,
    selectedName,
    requestedFocusId,
    displayedFocusId,
    focusState: focusState(),
    focusCoordinates: focusCoordinateEvidence(lastFrameView, displayedFocusView),
    animation: animationState && animationState.state === 'running'
      && displayedFocusView && displayedFocusId === requestedFocusId
      ? { ...animationState, state: 'completing' }
      : animationState,
    animationParameters: animationState ? {
      startParameter: animationState.startParameter,
      targetParameter: animationState.targetParameter,
      currentParameter: animationState.currentParameter,
      pendingFrame: animationState.pendingFrame
    } : null,
    reducedMotion: animationSkippedReason === 'prefers-reduced-motion',
    animationSkippedReason,
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
      controller: controller ? 'alive' : 'destroyed',
      animation: animation ? animation.getState().state : 'absent'
    },
    error: lastError
  };
  window.__M5_ANIMATION_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
}

function drawView(view, selectionForRing, operation) {
  const metrics = surface.getMetrics();
  projection = makeProjection(metrics);
  const nextScene = prepareScene(view.staged);
  const drawResult = drawGraphScene(surface, nextScene, { selectedId: selectionForRing });
  const labels = overlay.update({ scene: nextScene, presentation });
  scene = nextScene;
  lastFrameView = view;
  lastDrawResult = drawResult;
  lastLabels = labels;
  lastMetrics = metrics;
  updateStatus(operation, drawResult, labels, metrics, true);
  return nextScene;
}

function renderImmediate(operation, focusId, preserved) {
  if (!surface || !baseStaged || !overlay || !controller) return;
  const selectionBefore = selectedId;
  const metrics = surface.getMetrics();
  transitioning = true;
  try {
    controller.invalidate();
    projection = makeProjection(metrics);
    const view = createFocusView(baseStaged, { focusId, phase: phaseEl.value });
    const nextScene = prepareScene(view.staged);
    const installation = installSelectionFrame(controller, {
      scene: nextScene,
      generation: generation + 1,
      selectedId: selectionBefore,
      draw() {
        const drawResult = drawGraphScene(surface, nextScene, { selectedId: selectionBefore });
        const labels = overlay.update({ scene: nextScene, presentation });
        return { drawResult, labels };
      }
    });
    generation += 1;
    scene = nextScene;
    lastFrameView = view;
    lastDrawResult = installation.drawResult.drawResult;
    lastLabels = installation.drawResult.labels;
    lastMetrics = metrics;
    displayedFocusView = view;
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
    displayedFocusView = null;
    displayedFocusId = null;
    selectedId = null;
    lastError = { name: error.name, code: error.code, message: error.message };
    try { controller.invalidate(); } catch { /* preserve original failure */ }
    updateStatus(operation, null, null, metrics, preserved);
  } finally {
    transitioning = false;
  }
}

function animationFrame(frame) {
  try {
    const ringSelection = frame.progress === 1 ? selectedBeforeAnimation : null;
    drawView(frame.view, ringSelection, 'animation-frame');
  } catch (error) {
    throw error;
  }
}

function animationComplete(completion) {
  if (!scene || !lastFrameView) {
    throw new Error('final animation frame was not drawn');
  }
  const metrics = surface.getMetrics();
  controller.update({ scene, generation: generation + 1 });
  if (selectedBeforeAnimation !== null) controller.restoreSelection(selectedBeforeAnimation);
  generation += 1;
  selectedId = controller.getState().selectedId;
  displayedFocusView = completion.view;
  displayedFocusId = requestedFocusId;
  lastFrameView = completion.view;
  updateStatus('animation-complete', lastDrawResult, lastLabels, metrics, true);
}

function animationError(event) {
  transitioning = true;
  try { if (controller) controller.invalidate(); } catch { /* keep original failure */ } finally { transitioning = false; }
  scene = null;
  displayedFocusView = null;
  displayedFocusId = null;
  selectedId = null;
  lastError = { name: event.error.name, code: event.error.code, message: event.error.message };
  updateStatus('animation-failed', null, null, surface ? surface.getMetrics() : null, true);
}

function animationSettled(event) {
  if (event.state.state === 'completed') {
    updateStatus('animation-complete', lastDrawResult, lastLabels, lastMetrics, true);
  } else if (event.state.state === 'cancelled') {
    updateStatus('animation-cancelled', null, null, lastMetrics, true);
  } else if (event.state.state === 'failed') {
    updateStatus('animation-failed', null, null, lastMetrics, true);
  }
}

function animationCancel(event) {
  transitioning = true;
  try { if (controller) controller.invalidate(); } catch { /* keep original failure */ } finally { transitioning = false; }
  lastError = null;
  updateStatus('animation-cancelled', null, null, surface ? surface.getMetrics() : null, true);
}

function createAnimator() {
  return createFocusAnimator({
    duration: 300,
    onFrame: animationFrame,
    onComplete: animationComplete,
    onError: animationError,
    onCancel: animationCancel,
    onSettled: animationSettled
  });
}

function preferredReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readDuration() {
  const value = Number(durationEl.value);
  if (!Number.isFinite(value) || value < 0 || value > 10000) {
    throw new Error('duration must be finite 0..10000ms');
  }
  return value;
}

function animationRunning() {
  return animation && animation.getState().state === 'running';
}

function focusSelected() {
  if (animationRunning()) {
    lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'busy' };
    updateStatus('focus-busy', null, null, surface ? surface.getMetrics() : null, true);
    return;
  }
  if (!selectedId) {
    lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'no-selection' };
    updateStatus('focus', null, null, surface ? surface.getMetrics() : null, true);
    return;
  }
  const target = selectedId;
  const lastFocus = displayedFocusId;
  let fromParameter = { x: 0, y: 0 };
  try {
    if (lastFocus !== null) fromParameter = focusParameter(baseStaged, lastFocus, phaseEl.value);
    const duration = preferredReducedMotion() ? 0 : readDuration();
    animationSkippedReason = duration === 0 && preferredReducedMotion() ? 'prefers-reduced-motion' : null;
    selectedBeforeAnimation = selectedId;
    lastFrameView = null;
    requestedFocusId = target;
    lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'animate-focus', selectedId: target };
    transitioning = true;
    try {
      controller.invalidate();
    } finally {
      transitioning = false;
    }
    const result = animation.start({
      base: baseStaged,
      focusId: target,
      phase: phaseEl.value,
      fromParameter,
      duration
    });
    if (result.status === 'failed') {
      throw result.error || new Error('animation failed');
    }
    if (result.status === 'busy') {
      lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'busy' };
    }
  } catch (error) {
    try { if (controller) controller.invalidate(); } catch { /* original failure */ }
    scene = null;
    displayedFocusId = null;
    displayedFocusView = null;
    selectedId = null;
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('focus-failed', null, null, surface ? surface.getMetrics() : null, true);
  }
}

function cancelRunning(reason) {
  if (animationRunning()) animation.cancel(reason);
}

function resetFocus() {
  const selectionBefore = selectedId;
  cancelRunning('reset-focus');
  requestedFocusId = null;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'reset-focus' };
  selectedId = selectionBefore;
  renderImmediate('reset-focus', null, true);
}

function resizeAll() {
  if (!surface || !overlay || !controller) {
    createAll('create');
    return;
  }
  const selectionBefore = selectedId;
  const focusToKeep = displayedFocusId;
  cancelRunning('resize');
  const before = surface.canvas;
  try {
    transitioning = true;
    try { controller.invalidate(); } finally { transitioning = false; }
    surface.resize({ width: hostContentSize().width, height: hostContentSize().height, dpr: selectedDpr().dpr });
    selectedId = selectionBefore;
    requestedFocusId = focusToKeep;
    renderImmediate('resize', focusToKeep, surface.canvas === before);
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

function resetReplacement(operation) {
  cancelRunning(operation);
  requestedFocusId = null;
  displayedFocusId = null;
  displayedFocusView = null;
  selectedId = null;
  lastUserEvent = null;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'replacement', reason: 'reset-focus-selection' };
  transitioning = true;
  try { controller.invalidate(); } finally { transitioning = false; }
  renderImmediate(operation, null, true);
}

function destroyAll() {
  if (animation) animation.destroy();
  if (controller) controller.destroy();
  if (overlay) overlay.destroy();
  if (surface) surface.destroy();
  animation = null;
  controller = null;
  overlay = null;
  surface = null;
  projection = null;
  scene = null;
  lastFrameView = null;
  displayedFocusView = null;
  lastDrawResult = null;
  lastLabels = null;
  lastMetrics = null;
  selectedId = null;
  requestedFocusId = null;
  displayedFocusId = null;
  updateStatus('destroy', null, null, null, false);
}

function recreateAll() {
  destroyAll();
  createAll('recreate');
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
  if (transitioning || animationRunning()) return;
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
    try { controller.invalidate(); } catch { /* original failure */ } finally { transitioning = false; }
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
    animation = createAnimator();
    commitFixture();
    selectedId = null;
    selectedBeforeAnimation = null;
    requestedFocusId = null;
    displayedFocusId = null;
    displayedFocusView = null;
    lastFrameView = null;
    animationSkippedReason = null;
    lastDrawResult = null;
    lastLabels = null;
    lastMetrics = null;
    lastUserEvent = null;
    lastProgrammaticEvent = null;
    renderImmediate(operation, null, false);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus(operation, null, null, surface ? surface.getMetrics() : null, false);
  }
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
  resetReplacement('phase');
});
dprEl.addEventListener('change', resizeAll);

createAll('create');




