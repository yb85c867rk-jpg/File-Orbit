import {
  applyFixedGlyphPolicy,
  evaluateClearanceApplicability,
  measurePreparedScene,
  comparePreparedScenes,
  radialSpread
} from '../../../src/engine/hypertree/layout/index.js';
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
  EXPERIMENTAL_CAMERA_LIMITS,
  prepareCameraFrame,
  prepareFitFrame,
  prepareResetFocusFrame,
  resolveResizeFraming,
  cameraForward,
  cameraInverse,
  createCamera,
  resetCamera,
  zoomCameraAt
} from '../../../src/engine/hypertree/navigation/index.js';
import { createMouseNavigationController } from '../../../src/engine/hypertree/navigation/index.js';
import { executeResetFocus } from './reset-focus-action.mjs';
import { buildLayoutPlan } from './layout-builder.mjs';
import { f20, f200 } from '../../engine/layout/fixtures.mjs';
import { crowdedFolder, denseNeighbors, mixedDeepWide, longLabels, infeasibleDepth } from '../../engine/layout/crowding-fixtures.mjs';

const host = document.querySelector('#graph-host');
const statusEl = document.querySelector('#status');
const fixtureEl = document.querySelector('#fixture');
const phaseEl = document.querySelector('#phase');
const dprEl = document.querySelector('#dpr-source');
const modeEl = document.querySelector('#mode');
const minStepEl = document.querySelector('#min-step');
const radialFlexEl = document.querySelector('#radial-flex');
const branchWeightEl = document.querySelector('#branch-weight');
const demandCompressionEl = document.querySelector('#demand-compression');
const presentationEl = document.querySelector('#presentation');
const labelPolicyEl = document.querySelector('#label-policy');
const bandCountEl = document.querySelector('#band-count');
const refineV2El = document.querySelector('#refine-v2');
const correctionModeEl = document.querySelector('#correction-mode');
const metricsEl = document.querySelector('#metrics');
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
let requestedMode = 'baseline';
let displayedMode = null;
let requestedExperiment = null;
let comparison = null;
let layoutMetrics = null;
let refinementRequested = false;
let refinementInfo = null;
let correctionMode = 'off';
let crowdingInfo = null;
let workspaceScale = 1;
let feasibilityStale = false;
let framingMode = 'manual';
let fitInfo = null;
let fitProjectionEvidence = null;
let frameEvidence = null;

const fixtures = {
  f20, f200, crowdedFolder, denseNeighbors, mixedDeepWide, longLabels, infeasible: infeasibleDepth
};
const FILE_NAMES = [
  'readme.md', 'manual.PDF', 'notes.txt', 'photo.png', 'archive.tar.gz',
  'mystery.bin', 'résumé.md', '<img src=x onerror=alert(1)>.md',
  'LICENSE', 'settings.JSON'
];

function readExperimentConfig() {
  return {
    minStep: Number(minStepEl.value),
    radialFlex: Number(radialFlexEl.value),
    branchWeight: Number(branchWeightEl.value),
    demandCompression: Number(demandCompressionEl.value),
    bandCount: Number(bandCountEl.value)
  };
}

function presentationForTree(root) {
  const map = new Map();
  const visit = (node) => {
    map.set(node.id, { name: node.name, kind: node.kind });
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return map;
}

function projectionBaseRadius() {
  const size = hostContentSize();
  return Math.max(1, Math.min(size.width, size.height) * 0.42);
}

function buildLayout(mode, tree) {
  const start = performance.now();
  const built = buildLayoutPlan({
    mode,
    tree,
    config: readExperimentConfig(),
    phases: ['current', 'start', 'end'],
    viewport: hostContentSize(),
    baseRadiusCss: projectionBaseRadius(),
    phase: phaseEl.value,
    refine: refineV2El.checked,
    correction: correctionModeEl.value
  });
  return { ...built, elapsedMs: performance.now() - start };
}
function measureLabels(scene, presentation, width, height) {
  const metricsHost = document.createElement('div');
  metricsHost.style.position = 'absolute';
  metricsHost.style.left = '-100000px';
  metricsHost.style.top = '0';
  metricsHost.style.width = `${Math.max(0, width)}px`;
  metricsHost.style.height = `${Math.max(0, height)}px`;
  metricsHost.style.visibility = 'hidden';
  metricsHost.style.pointerEvents = 'none';
  document.body.appendChild(metricsHost);
  const labelOverlay = createLabelOverlay(metricsHost, { maxLabels: 40, maxWidth: 160, placement: labelPolicyEl.value });
  try {
    const m = labelOverlay.update({ scene, presentation });
    return {
      candidateCount: m.candidateCount,
      createdCount: m.createdCount,
      visibleCount: m.visibleCount,
      suppressedCount: m.suppressedCount,
      overlapSuppressedCount: m.overlapSuppressedCount,
      viewportSuppressedCount: m.viewportSuppressedCount,
      textMismatchCount: m.textMismatchCount,
      measurement: m.measurement,
      provenance: 'DOM-measured temporary overlay'
    };
  } finally {
    labelOverlay.destroy();
    metricsHost.remove();
  }
}

function compareLayouts(tree, width, height) {
  const result = {};
  const scenes = {};
  let fairScale = 1;
  try {
    fairScale = buildLayout('v2', tree).workspaceScale;
  } catch {
    fairScale = 1;
  }
  result.workspaceScale = fairScale;
  for (const mode of ['baseline', 'v1', 'v2']) {
    try {
      const built = buildLayout(mode, tree);
      const projection = createProjection({ width, height, radius: projectionBaseRadius() * fairScale });
      const nodeDims = new Map([...built.graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
      const nodeKinds = new Map([...built.graph.nodes].map(([id, node]) => [id, node.kind]));
      let scene = prepareGraphScene(built.staged, { phase: 'current', projection, nodeDims, nodeKinds });
      if (presentationEl.value === 'fixed6') scene = applyFixedGlyphPolicy(scene, { radius: 6 });
      const presentation = presentationForTree(tree);
      scenes[mode] = scene;
      result[mode] = {
        mode,
        layoutMs: built.elapsedMs,
        nodes: measurePreparedScene(scene),
        radialSpread: Object.fromEntries(radialSpread(built.staged, 'current')),
        labels: measureLabels(scene, presentation, width, height),
        provenance: 'node metrics shape-aware; labels DOM-measured; layoutMs performance.now'
      };
    } catch (error) {
      result[mode] = { mode, error: { name: error.name, code: error.code, message: error.message } };
    }
  }
  if (scenes.baseline && scenes.v2) {
    result.detail = comparePreparedScenes(scenes.baseline, scenes.v2, { viewport: { width, height } });
  }
  if (scenes.v1 && scenes.v2) {
    result.detailV1VsV2 = comparePreparedScenes(scenes.v1, scenes.v2, { viewport: { width, height } });
  }
  return result;
}

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
  return createProjection({ width: metrics.cssWidth, height: metrics.cssHeight, radius: projectionBaseRadius() * workspaceScale });
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
  requestedMode = modeEl.value;
  requestedExperiment = readExperimentConfig();
  const tree = fixtures[fixtureEl.value]();
  const built = buildLayout(requestedMode, tree);
  graph = built.graph;
  baseStaged = built.staged;
  presentation = presentationForTree(tree);
  baseView = createFocusView(baseStaged, { focusId: null, phase: phaseEl.value });
  workspaceScale = built.workspaceScale;
  refinementRequested = requestedMode === 'v2' && refineV2El.checked;
  refinementInfo = built.refinement || null;
  correctionMode = requestedMode === 'v2' ? correctionModeEl.value : 'off';
  crowdingInfo = built.crowding || null;
  if (surface) projection = makeProjection(surface.getMetrics());
  feasibilityStale = false;
  layoutMetrics = {
    mode: requestedMode,
    config: requestedMode === 'experimental' ? built.config : null,
    elapsedMs: built.elapsedMs,
    workspaceScale: built.workspaceScale,
    feasibility: built.feasibility,
    provenance: 'performance.now around staged layout only'
  };
  comparison = compareLayouts(tree, Math.floor(host.clientWidth), Math.floor(host.clientHeight));
}
function prepareScene(view, projectionOverride = projection) {
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  return prepareGraphScene(view.staged, { phase: phaseEl.value, projection: projectionOverride, nodeDims, nodeKinds });
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
  const world = cameraInverse(camera, { x: vp.width / 2, y: vp.height / 2 }, vp, cameraLimits);
  const screen = cameraForward(camera, world, vp, cameraLimits);
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
    harness: 'm5-adaptive-layout',
    browserVerification: 'HARNESS_LOADED',
    experimental: true,
    note: 'EXPERIMENTAL opt-in layout; baseline remains default. Mouse navigation only; no touch/keyboard/inertia/opening/file access.',
    requestedMode,
    displayedMode,
    requestedExperiment,
    presentationPolicy: presentationEl.value,
    labelPolicy: labelPolicyEl.value,
    workspaceScale,
    feasibilityStale,
    framingMode,
    fitReason: fitInfo ? fitInfo.reason : 'manual',
    fit: compactFit(fitInfo),
    refinementRequested,
    refinementApplied: refinementInfo ? refinementInfo.applied : false,
    refinement: compactRefinement(refinementInfo),
    correctionMode,
    correctionAppliedMode: crowdingInfo ? crowdingInfo.mode || 'global' : null,
    crowdingApplied: crowdingInfo ? crowdingInfo.applied : false,
    crowding: compactCrowding(crowdingInfo),
    fitProjection: fitProjectionEvidence,
    currentFrame: frameEvidence,
    fitDrawProjectionMatch: fitProjectionEvidence && frameEvidence
      && fitProjectionEvidence.projectionWidth === frameEvidence.projectionWidth
      && fitProjectionEvidence.projectionHeight === frameEvidence.projectionHeight
      && Math.abs(fitProjectionEvidence.projectionRadius - frameEvidence.projectionRadius) <= 1e-9
      && Math.abs(fitProjectionEvidence.workspaceScale - frameEvidence.workspaceScale) <= 1e-9
      && Math.abs(fitProjectionEvidence.cameraZoom - frameEvidence.cameraZoom) <= 1e-12
      && Math.abs(fitProjectionEvidence.cameraPanX - frameEvidence.cameraPanX) <= 1e-9
      && Math.abs(fitProjectionEvidence.cameraPanY - frameEvidence.cameraPanY) <= 1e-9,
    historicalLayoutFeasibility: layoutMetrics ? layoutMetrics.feasibility : null,
    cameraLimits: { ...cameraLimits },
    fitScope: 'node glyph containment only; labels/overlaps/layout clearance are separate',
    projectionContract: graph ? {
      calculationRadiusCss: layoutMetrics && layoutMetrics.feasibility
        ? layoutMetrics.feasibility.referenceProjectionRadiusCss : null,
      displayedRadiusCss: surface ? projectionBaseRadius() * workspaceScale : null,
      workspaceScale,
      cameraZoom: camera.zoom,
      clearanceApplicability: evaluateClearanceApplicability({
        calculationRadiusCss: layoutMetrics && layoutMetrics.feasibility
          ? layoutMetrics.feasibility.referenceProjectionRadiusCss : null,
        displayBaseRadiusCss: surface ? projectionBaseRadius() : null,
        workspaceScale,
        selectedWorkspaceScale: layoutMetrics && layoutMetrics.feasibility
          ? layoutMetrics.feasibility.workspaceScale : null,
        cameraZoom: camera.zoom,
        presentationKind: presentationEl.value === 'fixed6' ? 'fixed' : 'native',
        glyphRadiusCss: 6,
        evaluatedGlyphRadiusCss: 6,
        resized: feasibilityStale,
        focusChanged: displayedFocusId !== null
      }),
      feasibilityGuaranteeApplicable: evaluateClearanceApplicability({
        calculationRadiusCss: layoutMetrics && layoutMetrics.feasibility
          ? layoutMetrics.feasibility.referenceProjectionRadiusCss : null,
        displayBaseRadiusCss: surface ? projectionBaseRadius() : null,
        workspaceScale,
        selectedWorkspaceScale: layoutMetrics && layoutMetrics.feasibility
          ? layoutMetrics.feasibility.workspaceScale : null,
        cameraZoom: camera.zoom,
        presentationKind: presentationEl.value === 'fixed6' ? 'fixed' : 'native',
        glyphRadiusCss: 6,
        evaluatedGlyphRadiusCss: 6,
        resized: feasibilityStale,
        focusChanged: displayedFocusId !== null
      }).applicable,
      layoutFeasibilityAppliesToCurrentScale: evaluateClearanceApplicability({
        calculationRadiusCss: layoutMetrics && layoutMetrics.feasibility
          ? layoutMetrics.feasibility.referenceProjectionRadiusCss : null,
        displayBaseRadiusCss: surface ? projectionBaseRadius() : null,
        workspaceScale,
        selectedWorkspaceScale: layoutMetrics && layoutMetrics.feasibility
          ? layoutMetrics.feasibility.workspaceScale : null,
        cameraZoom: camera.zoom,
        presentationKind: presentationEl.value === 'fixed6' ? 'fixed' : 'native',
        glyphRadiusCss: 6,
        evaluatedGlyphRadiusCss: 6,
        resized: feasibilityStale,
        focusChanged: displayedFocusId !== null
      }).applicable
    } : null,
    layoutMetrics,
    comparison: compactComparison(comparison),
    fullDetailExport: 'window.__M5_ADAPTIVE_LAYOUT_FULL__',
    fitDetailExport: 'window.__M5_ADAPTIVE_LAYOUT_FIT__',
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
      viewportSuppressedCount: labels.viewportSuppressedCount,
      nodeObstacleSuppressedCount: labels.nodeObstacleSuppressedCount,
      labelNodeOverlapCount: labels.labelNodeOverlapCount,
      priorityVisibleCount: labels.priorityVisibleCount,
      prioritySuppressedCount: labels.prioritySuppressedCount,
      placementAttempts: labels.placementAttempts,
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
  window.__M5_ADAPTIVE_LAYOUT_FULL__ = comparison;
  window.__M5_ADAPTIVE_LAYOUT_FIT__ = fitInfo;
  window.__M5_ADAPTIVE_LAYOUT_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
  if (metricsEl) {
    metricsEl.textContent = JSON.stringify(comparison ? {
      workspaceScale: comparison.workspaceScale,
      baseline: summarizeComparison(comparison.baseline),
      v1: summarizeComparison(comparison.v1),
      v2: summarizeComparison(comparison.v2),
      detail: comparison.detail || null,
      detailV1VsV2: comparison.detailV1VsV2 || null
    } : null, null, 2);
  }
}

const cameraLimits = EXPERIMENTAL_CAMERA_LIMITS;

function fitOptions(view) {
  return {
    view,
    phase: phaseEl.value,
    viewport: viewport(),
    baseRadiusCss: projectionBaseRadius(),
    workspaceScale,
    padding: 24,
    presentation: presentationEl.value === 'fixed6'
      ? { kind: 'fixed', glyphRadiusCss: 6 }
      : { kind: 'native' },
    limits: cameraLimits,
    prepareScene,
    applyFixedGlyph: presentationEl.value === 'fixed6'
      ? (scene) => applyFixedGlyphPolicy(scene, { radius: 6 })
      : null
  };
}

function fitCurrentView(operation, view, preparedFrame = null, onBeforePublish = null) {
  const target = view || displayedFocusView || baseView;
  try {
    const prepared = preparedFrame || prepareFitFrame(fitOptions(target));
    projection = prepared.projection;
    fitProjectionEvidence = {
      projectionWidth: prepared.projection.width,
      projectionHeight: prepared.projection.height,
      projectionRadius: prepared.projection.radius,
      workspaceScale: prepared.workspaceScale,
      cameraZoom: prepared.fit.camera ? prepared.fit.camera.zoom : null,
      cameraPanX: prepared.fit.camera ? prepared.fit.camera.panX : null,
      cameraPanY: prepared.fit.camera ? prepared.fit.camera.panY : null,
      containedCount: prepared.fit.containedCount,
      eligibleCount: prepared.fit.eligibleCount
    };
    const fit = prepared.fit;
    if (!fit.ok) {
      scene = null;
      displayedCamera = null;
      framingMode = 'manual';
      fitInfo = fit;
      fitProjectionEvidence = null;
      frameEvidence = null;
      lastError = { name: 'FitError', code: fit.reason, message: 'fit is not feasible' };
      try { controller.invalidate(); } catch { /* preserve original failure */ }
      updateStatus(operation, null, null, surface ? surface.getMetrics() : null, true);
      return false;
    }
    framingMode = 'fit';
    fitInfo = fit;
    const ok = drawCameraFrame(operation, target, fit.camera, true, prepared.projection, onBeforePublish);
    if (!ok) {
      framingMode = 'manual';
      fitInfo = null;
  fitProjectionEvidence = null;
  frameEvidence = null;
    }
    return ok;
  } catch (error) {
    scene = null;
    frameEvidence = null;
    displayedCamera = null;
    framingMode = 'manual';
    fitInfo = null;
  fitProjectionEvidence = null;
  frameEvidence = null;
    lastError = { name: error.name, code: error.code, message: error.message };
    try { controller.invalidate(); } catch { /* preserve original failure */ }
    updateStatus(operation, null, null, surface ? surface.getMetrics() : null, true);
    return false;
  }
}
function drawCameraFrame(operation, view, nextCamera, preserved, frameProjection, onBeforePublish = null) {
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
    const preparedFrame = prepareCameraFrame({
      view,
      camera: nextCamera,
      viewport: { width: metrics.cssWidth, height: metrics.cssHeight },
      suppliedProjection: frameProjection,
      expectedProjection: makeProjection(metrics),
      limits: cameraLimits,
      prepareScene,
      applyFixedGlyph: presentationEl.value === 'fixed6'
        ? (scene) => applyFixedGlyphPolicy(scene, { radius: 6 })
        : null
    });
    projection = preparedFrame.projection;
    const cameraScene = preparedFrame.cameraScene;
    const installation = installSelectionFrame(controller, {
      scene: cameraScene,
      generation: nextGeneration,
      selectedId: selectionBefore,
      draw() {
        const drawResult = drawGraphScene(surface, cameraScene, { selectedId: selectionBefore });
        const labels = overlay.update({ scene: cameraScene, presentation, priorityIds: [selectionBefore, view.requestedId].filter(Boolean) });
        return { drawResult, labels };
      }
    });
    scene = cameraScene;
    frameEvidence = {
      projectionWidth: projection.width,
      projectionHeight: projection.height,
      projectionRadius: projection.radius,
      workspaceScale,
      cameraZoom: cameraScene.camera.zoom,
      cameraPanX: cameraScene.camera.panX,
      cameraPanY: cameraScene.camera.panY,
      generation: nextGeneration,
      nodeCount: cameraScene.nodes.size
    };
    displayedFocusView = view;
    displayedFocusId = view.requestedId;
    camera = nextCamera;
    displayedCamera = nextCamera;
    generation = nextGeneration;
    selectedId = installation.state.selectedId;
    navigation.update({ camera, viewport: { width: metrics.cssWidth, height: metrics.cssHeight }, cameraLimits });
    if (onBeforePublish) onBeforePublish();
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
  framingMode = 'manual';
  fitInfo = null;
  fitProjectionEvidence = null;
  frameEvidence = null;
  requestedFocusId = focusId;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: operation };
  return drawCameraFrame(operation, nextView, resetCamera(), preserved);
}
function cameraFrameFromNavigation(nextCamera, meta) {
  if (!displayedFocusView) return false;
  framingMode = 'manual';
  fitInfo = null;
  fitProjectionEvidence = null;
  frameEvidence = null;
  const ok = drawCameraFrame(meta.kind, displayedFocusView, nextCamera, true);
  if (!ok) throw lastError || new Error('camera frame failed');
  return true;
}

function zoomButtons(factor) {
  const vp = viewport();
  const next = zoomCameraAt(camera, factor, { x: vp.width / 2, y: vp.height / 2 }, vp, cameraLimits);
  framingMode = 'manual';
  fitInfo = null;
  fitProjectionEvidence = null;
  frameEvidence = null;
  requestedCamera = next;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'zoom-button', reason: factor > 1 ? 'zoom-in' : 'zoom-out' };
  if (!drawCameraFrame(factor > 1 ? 'zoom-in' : 'zoom-out', displayedFocusView || baseView, next, true)) {
    lastError = lastError || { code: 'camera-failed', message: 'zoom failed' };
  }
}

function resetCameraView() {
  framingMode = 'manual';
  fitInfo = null;
  fitProjectionEvidence = null;
  frameEvidence = null;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'camera-reset', reason: 'reset-camera' };
  drawCameraFrame('reset-camera', displayedFocusView || baseView, resetCamera(), true);
}

function fitGraph() {
  lastProgrammaticEvent = { kind: 'programmatic', source: 'fit-button', reason: 'fit-graph' };
  fitCurrentView('fit-graph', displayedFocusView || baseView);
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
  lastProgrammaticEvent = { kind: 'programmatic', source: 'focus-button', reason: 'reset-focus' };
  executeResetFocus({
    prepare: () => prepareResetFocusFrame({ baseView, ...fitOptions(baseView) }),
    fit: (prepared, onBeforePublish) => fitCurrentView('reset-focus', baseView, prepared, onBeforePublish),
    getFocusState: () => ({ requestedFocusId, displayedFocusId, framingMode }),
    setFocusState: (next) => {
      if ('requestedFocusId' in next) requestedFocusId = next.requestedFocusId;
      if ('displayedFocusId' in next) displayedFocusId = next.displayedFocusId;
      if ('framingMode' in next) framingMode = next.framingMode;
    }
  });
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
      const labels = overlay.update({ scene, presentation, priorityIds: [event.selectedId, displayedFocusId].filter(Boolean) });
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

function compactComparison(entry) {
  if (!entry) return null;
  const clone = JSON.parse(JSON.stringify(entry));
  for (const key of ['detail', 'detailV1VsV2']) {
    if (clone[key]) {
      for (const list of ['newlyHiddenIds', 'newlyVisibleIds']) {
        if (Array.isArray(clone[key][list])) {
          clone[key][list + 'Count'] = clone[key][list].length;
          clone[key][list + 'Sample'] = clone[key][list].slice(0, 10);
          delete clone[key][list];
        }
      }
    }
  }
  return clone;
}

function compactCrowding(entry) {
  if (!entry) return null;
  const metrics = (value) => value && value.metrics ? {
    totalNodes: value.metrics.totalNodes,
    visibleNodes: value.metrics.visibleNodes,
    hiddenNodes: value.metrics.hiddenNodes,
    overlapPairs: value.metrics.overlapPairs,
    minCenterSeparation: value.metrics.minCenterSeparation,
    minimumShapeBoundarySeparationCss: value.metrics.minimumShapeBoundarySeparationCss,
    radiusStats: value.metrics.radiusStats
  } : null;
  return {
    requested: entry.requested,
    applied: entry.applied,
    outcome: entry.outcome,
    attempts: entry.attempts,
    candidateLimit: entry.candidateLimit,
    maxNodes: entry.maxNodes,
    phase: entry.phase,
    selectedPattern: entry.selectedPattern,
    mode: entry.mode || 'global',
    affectedCount: entry.affectedCount,
    regionCount: entry.regionCount,
    budgets: entry.budgets,
    before: metrics(entry.before),
    after: metrics(entry.after),
    beforeFit: entry.before && entry.before.fit,
    afterFit: entry.after && entry.after.fit,
    displacement: entry.after && entry.after.displacement,
    candidates: entry.candidates,
    residualPairCount: entry.residualPairCount,
    residualByDepth: entry.residualByDepth,
    residualSample: entry.residualSample,
    scope: entry.scope
  };
}

function compactRefinement(entry) {
  if (!entry) return null;
  const compact = (metrics) => metrics ? {
    totalNodes: metrics.totalNodes,
    visibleNodes: metrics.visibleNodes,
    hiddenNodes: metrics.hiddenNodes,
    viewportIntersectingNodes: metrics.viewportIntersectingNodes,
    overlapPairs: metrics.overlapPairs,
    minCenterSeparation: metrics.minCenterSeparation,
    minimumGlyphBoundarySeparationCss: metrics.minimumGlyphBoundarySeparationCss,
    displacementFromBase: metrics.displacementFromBase,
    radiusStats: metrics.radiusStats,
    bounds: metrics.bounds
  } : null;
  return {
    requested: entry.requested,
    applied: entry.applied,
    outcome: entry.outcome,
    selectedPattern: entry.selectedPattern,
    selectedCandidateIndex: entry.selectedCandidateIndex,
    attempts: entry.attempts,
    candidateLimit: entry.candidateLimit,
    before: compact(entry.before),
    after: compact(entry.after),
    beforeFit: entry.beforeFit,
    afterFit: entry.afterFit,
    minimumBoundaryGainCss: entry.minimumBoundaryGainCss,
    presentation: entry.presentation
  };
}

function compactFit(entry) {
  if (!entry) return null;
  return {
    reason: entry.reason,
    eligibleCount: entry.eligibleCount,
    containedCount: entry.containedCount,
    clippedCount: entry.clippedCount,
    clippedIdsSample: Array.isArray(entry.clippedIds) ? entry.clippedIds.slice(0, 10) : [],
    padding: entry.padding,
    requiredZoom: entry.requiredZoom,
    appliedZoom: entry.appliedZoom,
    requiredBelowMin: entry.requiredBelowMin,
    presentation: entry.presentation,
    projectionScale: entry.projectionScale,
    toleranceCss: entry.toleranceCss
  };
}

function summarizeComparison(entry) {
  if (!entry) return null;
  if (entry.error) return { mode: entry.mode, error: entry.error };
  return {
    mode: entry.mode,
    layoutMs: entry.layoutMs,
    visibleNodes: entry.nodes.visibleNodes,
    overlapPairs: entry.nodes.overlapPairs,
    minCenterSeparation: entry.nodes.minCenterSeparation,
    bounds: entry.nodes.bounds,
    radialSpread: entry.radialSpread,
    labels: entry.labels,
    provenance: entry.provenance
  };
}

function createAll(operation) {
  const size = hostContentSize();
  const choice = selectedDpr();
  try {
    surface = createCanvasSurface(host, { width: size.width, height: size.height, dpr: choice.dpr });
    overlay = createLabelOverlay(host, { maxLabels: 40, maxWidth: 160, placement: labelPolicyEl.value });
    controller = createSelectionController(surface.canvas, { onChange: selectionChanged });
    projection = makeProjection(surface.getMetrics());
    navigation = createMouseNavigationController(surface.canvas, {
      viewport: viewport(),
      camera: resetCamera(),
      cameraLimits,
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
    displayedMode = requestedMode;
    framingMode = 'fit';
    const ok = fitCurrentView(operation, baseView);
    if (!ok) displayedMode = null;
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    scene = null;
    displayedMode = null;
    comparison = null;
    try {
      if (navigation) navigation.destroy();
      if (controller) controller.destroy();
      if (overlay) overlay.destroy();
      if (surface) surface.destroy();
    } catch { /* preserve original failure */ }
    navigation = null;
    controller = null;
    overlay = null;
    surface = null;
    updateStatus(operation, null, null, null, false);
  }
}

function resizeAll() {
  if (!surface || !navigation) { createAll('create'); return; }
  if (requestedMode === 'v2') feasibilityStale = true;
  const before = surface.canvas;
  const selectionBefore = selectedId;
  const focusView = displayedFocusView || baseView;
  const currentCamera = camera;
  lastProgrammaticEvent = { kind: 'programmatic', source: 'resize', reason: 'resize' };
  try {
    surface.resize({ width: hostContentSize().width, height: hostContentSize().height, dpr: selectedDpr().dpr });
    selectedId = selectionBefore;
    const resizePolicy = resolveResizeFraming({ framingMode, currentCamera, fitCamera: null });
    if (resizePolicy.mode === 'fit') {
      fitCurrentView('resize', focusView);
    } else {
      drawCameraFrame('resize', focusView, resizePolicy.camera, surface.canvas === before);
    }
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
  framingMode = 'fit';
  lastProgrammaticEvent = { kind: 'programmatic', source: 'replacement', reason: operation };
  fitCurrentView(operation, baseView);
}

function destroyAll() {
  if (navigation) navigation.destroy();
  if (controller) controller.destroy();
  if (overlay) overlay.destroy();
  if (surface) surface.destroy();
  displayedMode = null;
  comparison = null;
  layoutMetrics = null;
  if (metricsEl) metricsEl.textContent = '';
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
document.querySelector('#fit-graph').addEventListener('click', fitGraph);
document.querySelector('#reset-camera').addEventListener('click', resetCameraView);
document.querySelector('#focus-selected').addEventListener('click', focusSelected);
document.querySelector('#reset-focus').addEventListener('click', resetFocus);
document.querySelector('#clear').addEventListener('click', clearSelection);
document.querySelector('#apply-layout').addEventListener('click', () => { destroyAll(); createAll('layout-change'); });
document.querySelector('#label-policy').addEventListener('change', () => {
  if (!surface || !overlay) return;
  overlay.destroy();
  overlay = createLabelOverlay(host, { maxLabels: 40, maxWidth: 160, placement: labelPolicyEl.value });
  drawCameraFrame('label-policy', displayedFocusView || baseView, camera, true);
});
document.querySelector('#resize').addEventListener('click', resizeAll);
document.querySelector('#recreate').addEventListener('click', recreateAll);
document.querySelector('#destroy').addEventListener('click', destroyAll);
fixtureEl.addEventListener('change', () => { if (surface) destroyAll(); createAll('fixture'); });
phaseEl.addEventListener('change', () => { if (surface) destroyAll(); createAll('phase'); });
dprEl.addEventListener('change', resizeAll);

createAll('create');






























































