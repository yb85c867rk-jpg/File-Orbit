import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { computeRadialLayout, applyFixedGlyphPolicy } from '../../../src/engine/hypertree/layout/index.js';
import { buildExplorationPresentation } from '../../../src/engine/hypertree/exploration/presentation.js';
import { themedCanvasScene, THEME_LIGHT, THEME_DARK } from '../../harness/m5-exploration/shell-controls.js';
import {
  createProjection,
  drawGraphScene,
  prepareGraphScene,
  renderGraphScene,
  DEFAULT_PRESENTATION,
  DEFAULT_SELECTION,
  GraphRenderError,
  SCENE_LIMITS
} from '../../../src/engine/hypertree/render/index.js';
import { f20, f200 } from '../layout/fixtures.mjs';

function makeScene(tree, overrides = {}) {
  const { graph } = loadTree(tree);
  const staged = computeRadialLayout(graph, {
    rootId: 'n0',
    phases: overrides.phases || ['current', 'start', 'end'],
    nodeOptions: { overridable: true },
    radius: 100,
    offset: 0.1
  });
  const nodeDims = new Map([...graph.nodes].map(([id, node]) => [id, Number(node.data.$dim) || 0]));
  const nodeKinds = new Map([...graph.nodes].map(([id, node]) => [id, node.kind]));
  const projection = overrides.projection || createProjection({ width: 800, height: 600, radius: 100 });
  const scene = prepareGraphScene(staged, {
    phase: overrides.phase || 'current',
    projection,
    nodeDims,
    nodeKinds,
    nodeOpacity: overrides.nodeOpacity,
    presentation: overrides.presentation
  });
  return { graph, staged, scene, projection, nodeDims, nodeKinds };
}

function fakeSurface(width = 100, height = 80, dpr = 1) {
  const calls = [];
  const initial = {
    fillStyle: 'initial-fill', strokeStyle: 'initial-stroke', lineWidth: 7,
    globalAlpha: 0.25, globalCompositeOperation: 'destination-out',
    lineDashOffset: 7, shadowBlur: 9, shadowColor: 'red',
    shadowOffsetX: 3, shadowOffsetY: 4, filter: 'blur(2px)',
    lineJoin: 'round', lineCap: 'round', miterLimit: 3, lineDash: [5, 2]
  };
  const state = { ...initial };
  const stack = [];
  const ctx = {
    get fillStyle() { return state.fillStyle; }, set fillStyle(v) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; }, set strokeStyle(v) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; }, set lineWidth(v) { state.lineWidth = v; },
    get globalAlpha() { return state.globalAlpha; }, set globalAlpha(v) { state.globalAlpha = v; },
    get globalCompositeOperation() { return state.globalCompositeOperation; }, set globalCompositeOperation(v) { state.globalCompositeOperation = v; },
    get lineDashOffset() { return state.lineDashOffset; }, set lineDashOffset(v) { state.lineDashOffset = v; },
    get shadowBlur() { return state.shadowBlur; }, set shadowBlur(v) { state.shadowBlur = v; },
    get shadowColor() { return state.shadowColor; }, set shadowColor(v) { state.shadowColor = v; },
    get shadowOffsetX() { return state.shadowOffsetX; }, set shadowOffsetX(v) { state.shadowOffsetX = v; },
    get shadowOffsetY() { return state.shadowOffsetY; }, set shadowOffsetY(v) { state.shadowOffsetY = v; },
    get filter() { return state.filter; }, set filter(v) { state.filter = v; },
    get lineJoin() { return state.lineJoin; }, set lineJoin(v) { state.lineJoin = v; },
    get lineCap() { return state.lineCap; }, set lineCap(v) { state.lineCap = v; },
    get miterLimit() { return state.miterLimit; }, set miterLimit(v) { state.miterLimit = v; },
    setLineDash(v) { state.lineDash = [...v]; calls.push(['setLineDash', [...v]]); },
    save() { stack.push({ ...state, lineDash: [...state.lineDash] }); calls.push(['save']); },
    restore() { Object.assign(state, stack.pop()); calls.push(['restore']); },
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h, state.globalAlpha, state.globalCompositeOperation, [...state.lineDash], state.filter, state.shadowBlur, state.shadowColor]); },
    beginPath() { calls.push(['beginPath']); },
    closePath() { calls.push(['closePath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    arc(x, y, r, a, b, sense) { calls.push(['arc', x, y, r, a, b, sense]); },
    fill() { calls.push(['fill', state.globalAlpha, state.fillStyle]); },
    stroke() { calls.push(['stroke', state.globalAlpha, state.globalCompositeOperation, [...state.lineDash], state.shadowBlur, state.shadowColor, state.filter, state.strokeStyle, state.lineWidth]); }
  };
  return {
    calls,
    ctx,
    state,
    getMetrics() {
      return {
        cssWidth: width,
        cssHeight: height,
        dpr,
        backingWidth: Math.round(width * dpr),
        backingHeight: Math.round(height * dpr),
        scaleX: dpr,
        scaleY: dpr
      };
    },
    context: ctx,
    clear() { calls.push(['clear']); }
  };
}

test('F20/F200 scene prepares one node per staged node and one edge per child', () => {
  for (const [tree, count] of [[f20(), 20], [f200(), 200]]) {
    const { staged, scene } = makeScene(tree);
    assert.equal(scene.nodeCount, count);
    assert.equal(scene.edgeCount, count - 1);
    const pairs = new Set();
    for (const [parent, children] of staged.children) {
      for (const child of children) {
        const key = `${parent}\u0000${child}`;
        assert.equal(pairs.has(key), false, `duplicate edge ${key}`);
        pairs.add(key);
      }
    }
    assert.equal(pairs.size, count - 1);
    assert.equal(scene.nodes.get('n0').kind, 'folder');
    assert.equal(scene.nodes.get('n0').shape, 'circle');
    const file = scene.nodes.get(count === 20 ? 'n19' : 'n40');
    if (file) assert.equal(file.shape, 'diamond');
  }
});

test('node projection, boundary shrink, and folder/file shapes', () => {
  const { scene, projection, graph } = makeScene(f20());
  const root = scene.nodes.get('n0');
  assert.deepEqual(root.center, projection.toCss(0, 0));
  assert.equal(root.radius, Number(graph.getNode('n0').data.$dim));
  assert.equal(root.visible, true);

  const n3 = scene.nodes.get('n15');
  const record = graph.getNode('n15');
  const x = Math.cos(record.pos.theta) * record.pos.rho;
  const y = Math.sin(record.pos.theta) * record.pos.rho;
  const expected = Number(record.data.$dim) * (1 - x * x - y * y);
  assert.ok(Math.abs(n3.radius - expected) < 1e-12);
  assert.equal(n3.kind, 'file');
  assert.equal(n3.shape, 'diamond');
});

test('phase selection is explicit and invalid phases reject', () => {
  const { staged, projection, nodeDims, nodeKinds } = makeScene(f20());
  const end = prepareGraphScene(staged, {
    phase: 'end',
    projection,
    nodeDims,
    nodeKinds
  });
  assert.equal(end.phase, 'end');
  assert.equal(end.nodeCount, 20);
  assert.throws(
    () => prepareGraphScene(staged, { phase: 'bogus', projection, nodeDims, nodeKinds }),
    (e) => e instanceof GraphRenderError && e.code === 'invalid-phase'
  );
});

test('empty scene is valid and draws only the background', () => {
  const projection = createProjection({ width: 100, height: 80, radius: 20 });
  const staged = {
    rootId: 'r',
    phases: ['current'],
    firstPhase: 'current',
    nodes: new Map(),
    children: new Map()
  };
  const scene = prepareGraphScene(staged, { projection });
  assert.equal(scene.nodeCount, 0);
  assert.equal(scene.edgeCount, 0);
  const surface = fakeSurface();
  const result = drawGraphScene(surface, scene);
  assert.deepEqual(result, {
    drawnNodes: 0,
    drawnEdges: 0,
    selectionDrawn: false,
    highlightedFolders: 0,
    skippedZeroSize: false,
    width: 100,
    height: 80
  });
  assert.equal(surface.calls[0][0], 'save');
  assert.equal(surface.calls.at(-1)[0], 'restore');
  assert.ok(surface.calls.some((c) => c[0] === 'fillRect'));
});

test('draw order is deterministic edges then nodes and respects visibility', () => {
  const { scene } = makeScene(f20());
  const surface = fakeSurface();
  const result = drawGraphScene(surface, scene);
  assert.equal(result.drawnEdges, scene.edgeCount);
  assert.equal(result.drawnNodes, [...scene.nodes.values()].filter((n) => n.visible && n.kind === 'folder').length);
  assert.equal(surface.calls[0][0], 'save');
  assert.equal(surface.calls.at(-1)[0], 'restore');

  const firstFillIndex = surface.calls.findIndex((c) => c[0] === 'fill');
  const firstFillRectIndex = surface.calls.findIndex((c) => c[0] === 'fillRect');
  assert.ok(firstFillRectIndex >= 0 && firstFillRectIndex < firstFillIndex);
  assert.equal(scene.edges.length, 19);
  const edgeKeys = new Set(scene.edges.map((e) => `${e.fromId}\u0000${e.toId}`));
  assert.equal(edgeKeys.size, 19);
});

test('invalid/oversize scenes and invalid styles reject before drawing', () => {
  const { staged, projection, nodeDims, nodeKinds } = makeScene(f20());
  const surface = fakeSurface();

  assert.throws(
    () => prepareGraphScene(staged, {
      phase: 'current',
      projection,
      nodeDims: new Map([['n0', Number.NaN]]),
      nodeKinds
    }),
    (e) => e instanceof GraphRenderError
  );
  assert.throws(
    () => prepareGraphScene(staged, {
      phase: 'current',
      projection,
      nodeDims,
      nodeKinds,
      presentation: { edgeWidth: Number.NaN }
    }),
    (e) => e.code === 'invalid-style'
  );
  assert.throws(
    () => prepareGraphScene(staged, {
      phase: 'current',
      projection,
      nodeDims,
      nodeKinds,
      presentation: { maxArcRadiusCss: 0 }
    }),
    (e) => e.code === 'invalid-style'
  );

  const many = new Map(staged.nodes);
  for (let i = staged.nodes.size; i < SCENE_LIMITS.maxNodes + 1; i += 1) {
    const id = `x${i}`;
    many.set(id, {
      ...staged.nodes.get('n0'),
      id,
      positions: staged.nodes.get('n0').positions
    });
  }
  assert.throws(
    () => prepareGraphScene({ ...staged, nodes: many }, { projection }),
    (e) => e.code === 'scene-limit'
  );
  assert.deepEqual(surface.calls, []);
});

test('DPR does not change CSS drawing geometry; context state is restored', () => {
  const { scene } = makeScene(f20());
  const a = fakeSurface(800, 600, 1);
  const b = fakeSurface(800, 600, 2);
  drawGraphScene(a, scene);
  drawGraphScene(b, scene);
  const normalize = (calls) => calls.filter((c) => c[0] !== 'clear');
  assert.deepEqual(normalize(a.calls), normalize(b.calls));
  assert.deepEqual(a.state, { fillStyle: 'initial-fill', strokeStyle: 'initial-stroke', lineWidth: 7, globalAlpha: 0.25, globalCompositeOperation: 'destination-out', lineDashOffset: 7, shadowBlur: 9, shadowColor: 'red', shadowOffsetX: 3, shadowOffsetY: 4, filter: 'blur(2px)', lineJoin: 'round', lineCap: 'round', miterLimit: 3, lineDash: [5, 2] });
  assert.deepEqual(b.state, { fillStyle: 'initial-fill', strokeStyle: 'initial-stroke', lineWidth: 7, globalAlpha: 0.25, globalCompositeOperation: 'destination-out', lineDashOffset: 7, shadowBlur: 9, shadowColor: 'red', shadowOffsetX: 3, shadowOffsetY: 4, filter: 'blur(2px)', lineJoin: 'round', lineCap: 'round', miterLimit: 3, lineDash: [5, 2] });
});

test('drawGraphScene rejects mutated late nodes/edges before clearing', () => {
  const { scene } = makeScene(f20());
  const late = [...scene.nodes.values()].at(-1);
  late.radius = -1;
  const surface = fakeSurface();
  assert.throws(
    () => drawGraphScene(surface, scene),
    (error) => error instanceof GraphRenderError && error.code === 'invalid-node'
  );
  assert.deepEqual(surface.calls, []);

  const second = makeScene(f20()).scene;
  second.edges.at(-1).fromCss.x = Number.NaN;
  const secondSurface = fakeSurface();
  assert.throws(
    () => drawGraphScene(secondSurface, second),
    (error) => error.code === 'invalid-edge'
  );
  assert.deepEqual(secondSurface.calls, []);

  const third = makeScene(f20()).scene;
  third.nodes.get('n0').fill = 'not-a-css-color';
  const thirdSurface = fakeSurface();
  assert.throws(
    () => drawGraphScene(thirdSurface, third),
    (error) => error.code === 'invalid-style'
  );
  assert.deepEqual(thirdSurface.calls, []);

  const fourth = makeScene(f20()).scene;
  fourth.edges[0].stroke = 'not-a-css-color';
  const fourthSurface = fakeSurface();
  assert.throws(
    () => drawGraphScene(fourthSurface, fourth),
    (error) => error.code === 'invalid-style'
  );
  assert.deepEqual(fourthSurface.calls, []);
});

test('drawing establishes a neutral Canvas baseline and restores caller state', () => {
  const { scene } = makeScene(f20());
  const surface = fakeSurface(800, 600, 1);
  drawGraphScene(surface, scene);
  const fillRect = surface.calls.find((c) => c[0] === 'fillRect');
  assert.deepEqual(fillRect.slice(5), [1, 'source-over', [], 'none', 0, 'transparent']);
  for (const call of surface.calls.filter((c) => c[0] === 'stroke')) {
    assert.equal(call[1], 1);
    assert.equal(call[2], 'source-over');
    assert.deepEqual(call[3], []);
    assert.equal(call[4], 0);
    assert.equal(call[5], 'transparent');
    assert.equal(call[6], 'none');
  }
  assert.deepEqual(surface.state, {
    fillStyle: 'initial-fill', strokeStyle: 'initial-stroke', lineWidth: 7,
    globalAlpha: 0.25, globalCompositeOperation: 'destination-out',
    lineDashOffset: 7, shadowBlur: 9, shadowColor: 'red',
    shadowOffsetX: 3, shadowOffsetY: 4, filter: 'blur(2px)',
    lineJoin: 'round', lineCap: 'round', miterLimit: 3, lineDash: [5, 2]
  });
});

test('presentation colors require supported hex syntax', () => {
  const { staged, projection } = makeScene(f20());
  for (const key of ['background', 'edgeStroke', 'folderFill', 'folderStroke', 'fileFill', 'fileStroke', 'rootFill', 'rootStroke']) {
    assert.throws(
      () => prepareGraphScene(staged, {
        projection,
        presentation: { [key]: 'not-a-css-color' }
      }),
      (error) => error instanceof GraphRenderError && error.code === 'invalid-style',
      key
    );
  }
  const valid = prepareGraphScene(staged, {
    projection,
    presentation: Object.fromEntries(
      ['background', 'edgeStroke', 'folderFill', 'folderStroke', 'fileFill', 'fileStroke', 'rootFill', 'rootStroke']
        .map((key) => [key, '#fff'])
    )
  });
  assert.equal(valid.nodeCount, 20);
  assert.match(DEFAULT_PRESENTATION.background, /^#[0-9a-f]{6}$/);
});
test('zero-size surface is a no-op and destroyed surface errors propagate', () => {
  const { scene } = makeScene(f20());
  const zero = fakeSurface(0, 0, 1);
  const result = drawGraphScene(zero, scene);
  assert.equal(result.skippedZeroSize, true);
  assert.deepEqual(zero.calls, []);

  const broken = {
    getMetrics() { throw new GraphRenderError('invalid-scene', 'destroyed surface'); },
    context: {},
    clear() {}
  };
  assert.throws(() => drawGraphScene(broken, scene), (e) => e.code === 'invalid-scene');
});

test('scene preparation does not mutate staged data and instances are independent', () => {
  const { staged, scene, projection } = makeScene(f20());
  const beforeDepths = new Map(staged.depths);
  const beforeChildren = new Map([...staged.children].map(([id, list]) => [id, [...list]]));
  const second = prepareGraphScene(staged, { projection });
  assert.notEqual(second, scene);
  assert.notEqual(second.nodes, scene.nodes);
  assert.deepEqual(staged.depths, beforeDepths);
  assert.deepEqual(staged.children, beforeChildren);
  assert.equal(second.edges.length, scene.edges.length);
});

test('renderGraphScene conveniences compose preparation and drawing', () => {
  const { staged, projection, nodeDims, nodeKinds } = makeScene(f20());
  const surface = fakeSurface(800, 600);
  const result = renderGraphScene(surface, staged, { projection, nodeDims, nodeKinds });
  assert.equal(result.drawnNodes, 10);
  assert.equal(result.drawnEdges, 19);
  assert.equal(DEFAULT_PRESENTATION.edgeWidth, 1);
});
test('selection ring is drawn after nodes without mutating scene geometry', () => {
  const { scene } = makeScene(f20());
  const root = scene.nodes.get('n0');
  const beforeRadius = root.radius;
  const surface = fakeSurface(800, 600, 1);
  const result = drawGraphScene(surface, scene, { selectedId: 'n0', selection: DEFAULT_SELECTION });
  assert.equal(result.selectionDrawn, true);
  assert.equal(result.drawnNodes, 10);
  assert.equal(root.radius, beforeRadius);
  const lastStroke = surface.calls.filter((c) => c[0] === 'stroke').at(-1);
  assert.equal(lastStroke[7], '#818cf8');
  assert.equal(lastStroke[8], 2);
  const lastArc = surface.calls.filter((c) => c[0] === 'arc').at(-1);
  assert.equal(lastArc[3], root.radius + 3);
  assert.deepEqual(surface.state, {
    fillStyle: 'initial-fill', strokeStyle: 'initial-stroke', lineWidth: 7,
    globalAlpha: 0.25, globalCompositeOperation: 'destination-out',
    lineDashOffset: 7, shadowBlur: 9, shadowColor: 'red',
    shadowOffsetX: 3, shadowOffsetY: 4, filter: 'blur(2px)',
    lineJoin: 'round', lineCap: 'round', miterLimit: 3, lineDash: [5, 2]
  });
});

test('highlighted folders draw a dashed non-color outline; selection remains distinct', () => {
  const { scene } = makeScene(f20());
  const surface = fakeSurface(800, 600, 1);
  const result = drawGraphScene(surface, scene, { highlightedFolderIds: ['n7'], highlight: { color: '#FCA5A5', width: 1.5, gap: 5 } });
  assert.equal(result.highlightedFolders, 1);
  const highlightStroke = surface.calls.filter((c) => c[0] === 'stroke' && c[7] === '#FCA5A5').at(-1);
  assert.ok(highlightStroke);
  assert.deepEqual(highlightStroke[3], [3, 2]);
  const lastArc = surface.calls.filter((c) => c[0] === 'arc').at(-1);
  assert.equal(lastArc[3], scene.nodes.get('n7').radius + 5);
  const selectedSurface = fakeSurface(800, 600, 1);
  drawGraphScene(selectedSurface, scene, { selectedId: 'n7', highlightedFolderIds: ['n7'], highlight: { color: '#FCA5A5' } });
  const selectionStroke = selectedSurface.calls.filter((c) => c[0] === 'stroke').at(-1);
  assert.equal(selectionStroke[7], '#818cf8');
  assert.deepEqual(selectionStroke[3], []);
});

test('highlight rejects malformed IDs before clearing', () => {
  const surface = fakeSurface();
  assert.throws(() => drawGraphScene(surface, makeScene(f20()).scene, { highlightedFolderIds: [3] }), (error) => error.code === 'invalid-highlight');
});

test('selection skips hidden/missing IDs and invalid selection rejects before clear', () => {
  const { scene } = makeScene(f20());
  scene.nodes.get('n0').visible = false;
  const surface = fakeSurface();
  const result = drawGraphScene(surface, scene, { selectedId: 'n0' });
  assert.equal(result.selectionDrawn, false);

  const missing = drawGraphScene(surface, makeScene(f20()).scene, { selectedId: 'missing' });
  assert.equal(missing.selectionDrawn, false);

  const invalidSurface = fakeSurface();
  assert.throws(
    () => drawGraphScene(invalidSurface, makeScene(f20()).scene, { selectedId: 3 }),
    (error) => error.code === 'invalid-selection'
  );
  assert.throws(
    () => drawGraphScene(invalidSurface, makeScene(f20()).scene, { selectedId: 'n0', selection: { color: 'not-a-css-color' } }),
    (error) => error.code === 'invalid-style'
  );
  assert.deepEqual(invalidSurface.calls, []);
});
test('explicit per-frame opacity is validated and applied with drawing state restored', () => {
  const opacity = new Map([['n0', 0.5], ['n1', 0.25]]);
  const { scene } = makeScene(f20(), { nodeOpacity: opacity });
  assert.equal(scene.nodes.get('n0').opacity, 0.5);
  assert.equal(scene.nodes.get('n1').opacity, 0.25);
  const surface = fakeSurface(100, 80);
  const result = drawGraphScene(surface, scene);
  assert.equal(result.drawnNodes, 10);
  assert.equal(surface.state.globalAlpha, 0.25);
  assert.ok(surface.calls.some((call) => call[0] === 'stroke' && call[1] === 0.5));
});test('data nodes draw no glyph or selection ring; only folder circles are drawn', () => {
  const { graph, scene } = makeScene(f20());
  const surface = fakeSurface(800, 600);
  const folderCount = [...graph.nodes.values()].filter((node) => node.kind === 'folder').length;
  const dataId = [...graph.nodes.values()].find((node) => node.kind === 'file')?.id;
  assert.ok(dataId);
  const result = drawGraphScene(surface, scene, { selectedId: dataId });
  assert.equal(result.drawnNodes, folderCount);
  assert.equal(result.selectionDrawn, false);
});test('each folder glyph uses its own opacity independently of prior edge opacity', () => {
  const base = {
    rootId: 'r',
    presentation: { ...DEFAULT_PRESENTATION },
    nodes: new Map([
      ['r', { id: 'r', kind: 'folder', shape: 'circle', visible: true, center: { x: 40, y: 40 }, radius: 10, fill: DEFAULT_PRESENTATION.rootFill, stroke: DEFAULT_PRESENTATION.rootStroke, opacity: 0.7 }],
      ['a', { id: 'a', kind: 'folder', shape: 'circle', visible: true, center: { x: 100, y: 40 }, radius: 10, fill: DEFAULT_PRESENTATION.folderFill, stroke: DEFAULT_PRESENTATION.folderStroke, opacity: 0.4 }]
    ]),
    edges: [{ kind: 'line', fromId: 'r', toId: 'a', fromCss: { x: 40, y: 40 }, toCss: { x: 100, y: 40 }, opacity: 0.2, stroke: '#344054', width: 1 }]
  };
  const surface = fakeSurface(200, 100);
  const result = drawGraphScene(surface, base);
  assert.equal(result.drawnNodes, 2);
  const fills = surface.calls.filter((call) => call[0] === 'fill').map((call) => call[1]);
  assert.deepEqual(fills, [0.7, 0.4]);
  const strokes = surface.calls.filter((call) => call[0] === 'stroke').map((call) => call[1]);
  assert.deepEqual(strokes, [0.2, 0.7, 0.4]);
});test('exploration data circle draws and receives the indigo selection ring', () => {
  const scene = {
    rootId: 'r',
    presentation: { ...DEFAULT_PRESENTATION },
    nodes: new Map([
      ['r', { id: 'r', kind: 'folder', shape: 'circle', visible: true, center: { x: 20, y: 20 }, radius: 12, fill: '#F8FAFC', stroke: '#F8FAFC', opacity: 1 }],
      ['f', { id: 'f', kind: 'file', shape: 'circle', visible: true, center: { x: 60, y: 20 }, radius: 4, fill: '#22C55E', stroke: '#22C55E', opacity: 1 }]
    ]),
    edges: []
  };
  const surface = fakeSurface(200, 100);
  const result = drawGraphScene(surface, scene, { selectedId: 'f' });
  assert.equal(result.drawnNodes, 2);
  assert.equal(result.selectionDrawn, true);
  const arcs = surface.calls.filter((call) => call[0] === 'arc');
  assert.ok(arcs.some((call) => call[3] === 4));
});test('light theme reaches actual folder/root drawing operations without mutating source scene', () => {
  const { graph, staged, scene } = makeScene(f20());
  const presentation = buildExplorationPresentation({ baseLayout: { rootId: 'n0', depths: staged.depths }, graph });
  const darkScene = applyFixedGlyphPolicy(scene, { radii: presentation.radii, styles: presentation.styles });
  const originalRootFill = darkScene.nodes.get('n0').fill;
  const originalData = [...darkScene.nodes.values()].find((node) => node.kind === 'file');
  const lightScene = themedCanvasScene(darkScene, THEME_LIGHT);
  assert.equal(darkScene.nodes.get('n0').fill, originalRootFill);
  assert.equal(lightScene.nodes.get('n0').fill, '#0f172a');
  const surface = fakeSurface(800, 600);
  drawGraphScene(surface, lightScene, { selectedId: null });
  const fills = surface.calls.filter((call) => call[0] === 'fill').map((call) => call[2]);
  assert.ok(fills.includes('#0f172a'));
  assert.ok(fills.includes('#64748b'));
  assert.ok(fills.includes('#22C55E'));
  assert.equal(darkScene.nodes.get('n0').fill, originalRootFill);
  assert.equal(darkScene.nodes.get(originalData.id), originalData);
  const darkSurface = fakeSurface(800, 600);
  drawGraphScene(darkSurface, themedCanvasScene(darkScene, THEME_DARK), { selectedId: null });
  const darkFills = darkSurface.calls.filter((call) => call[0] === 'fill').map((call) => call[2]);
  assert.ok(darkFills.includes(originalRootFill));
  assert.ok(darkFills.includes('#22C55E'));
  const startScene = makeScene(f20(), { phase: 'start' }).scene;
  const startPresentation = buildExplorationPresentation({ baseLayout: { rootId: 'n0', depths: staged.depths }, graph });
  const startDark = applyFixedGlyphPolicy(startScene, { radii: startPresentation.radii, styles: startPresentation.styles });
  const startLight = themedCanvasScene(startDark, THEME_LIGHT);
  assert.equal(startLight.nodes.get('n0').fill, '#0f172a');
  const startSurface = fakeSurface(800, 600);
  drawGraphScene(startSurface, startLight, { selectedId: null });
  assert.ok(startSurface.calls.filter((call) => call[0] === 'fill').some((call) => call[2] === '#0f172a'));
  assert.deepEqual(lightScene.nodes.get('n0').center, darkScene.nodes.get('n0').center);
  assert.equal(lightScene.nodes.get('n0').radius, darkScene.nodes.get('n0').radius);
});





test('active search result draws a stronger solid blue outline after folder rings', () => {
  const { scene } = makeScene(f20());
  const surface = fakeSurface();
  const result = drawGraphScene(surface, scene, {
    highlightedFolderIds: ['n7'], activeHighlightId: 'n7',
    highlight: { color: '#60A5FA', width: 1.5, gap: 5, activeWidth: 3.5, activeGap: 7 }
  });
  assert.ok(surface.calls.some((c) => c[0] === 'stroke' && c[8] === 3.5));
  const active = surface.calls.filter((c) => c[0] === 'stroke' && c[7] === '#60A5FA' && c[8] === 3.5).at(-1);
  assert.ok(active);
  assert.deepEqual(active[3], []);
});

