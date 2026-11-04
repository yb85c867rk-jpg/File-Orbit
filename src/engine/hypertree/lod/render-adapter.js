import { createCanvasSurface } from '../render/canvas-surface.js';
import { createProjection } from '../render/coordinates.js';
import { prepareGraphScene } from '../render/scene.js';
import { drawGraphScene } from '../render/graph-renderer.js';
import { createLabelOverlay } from '../render/label-overlay.js';
import { createHitSnapshot, hitTestNode } from '../interaction/hit-test.js';

const PHASE = 'current';

export function presentationStaged(scene, width, height) {
  const nodes = new Map();
  nodes.set(scene.folder.id, { depth: 0, positions: new Map([[PHASE, { theta: 0, rho: 0 }]]) });
  const children = new Map([[scene.folder.id, scene.items.map((item) => item.id)]]);
  const items = scene.items;
  const ringCount = items.length <= 26 ? 1 : Math.ceil(items.length / 24);
  const base = Math.floor(items.length / ringCount);
  const remainder = items.length % ringCount;
  let cursor = 0;
  for (let ring = 0; ring < ringCount; ring += 1) {
    const count = base + (ring < remainder ? 1 : 0);
    const radius = ringCount === 1 ? 0.64 : 0.4 + ring * 0.34 / Math.max(1, ringCount - 1);
    for (let index = 0; index < count; index += 1) {
      const item = items[cursor];
      const theta = -Math.PI / 2 + (index / count) * Math.PI * 2;
      nodes.set(item.id, { depth: 1, positions: new Map([[PHASE, { theta, rho: Math.min(0.92, radius) }]]) });
      cursor += 1;
    }
  }
  return {
    schema: 'lod-local-presentation',
    rootId: scene.folder.id,
    phases: [PHASE],
    firstPhase: PHASE,
    nodes,
    children,
    nodeCount: nodes.size
  };
}

export function createLodRenderAdapter({ host, width = 1200, height = 700, dpr = globalThis.devicePixelRatio || 1 } = {}) {
  if (!host) throw new TypeError('adapter host is required');
  const surface = createCanvasSurface(host, { width, height, dpr });
  const labels = createLabelOverlay(host, {
    maxLabels: 18,
    maxWidth: 180,
    placement: 'around',
    overlapPadding: 2
  });
  let current = null;
  let disposed = false;

  function render(model, options = {}) {
    if (disposed) throw new Error('adapter is disposed');
    const scene = model.buildScene();
    const hostRect = host.getBoundingClientRect?.() || { width, height };
    const renderWidth = Number.isFinite(hostRect.width) && hostRect.width > 0 ? hostRect.width : width;
    const renderHeight = Number.isFinite(hostRect.height) && hostRect.height > 0 ? hostRect.height : height;
    const currentMetrics = surface.getMetrics();
    if (Math.abs(currentMetrics.cssWidth - renderWidth) > 0.5 || Math.abs(currentMetrics.cssHeight - renderHeight) > 0.5) {
      surface.resize({ width: renderWidth, height: renderHeight, dpr: globalThis.devicePixelRatio || 1 });
    }
    const staged = presentationStaged(scene, renderWidth, renderHeight);
    const projection = createProjection({ width: renderWidth, height: renderHeight, radius: Math.min(renderWidth, renderHeight) * 0.42 });
    const nodeKinds = new Map();
    const presentation = new Map();
    const centerRecord = model.documentRecord(scene.folder.id);
    nodeKinds.set(scene.folder.id, 'folder');
    presentation.set(scene.folder.id, { name: centerRecord.node.name, kind: 'folder', dataType: null, link: null });
    for (const item of scene.items) {
      const proxy = item.proxy === true;
      nodeKinds.set(item.id, proxy ? 'folder' : item.node.kind);
      presentation.set(item.id, {
        name: proxy ? item.cluster.label : item.node.name,
        kind: proxy ? 'folder' : item.node.kind,
        dataType: proxy ? null : item.node.data?.dataType ?? null,
        link: proxy ? null : item.node.data?.link ?? null
      });
    }
    const prepared = prepareGraphScene(staged, { phase: PHASE, projection, nodeKinds });
    const selectedId = options.selectedId ?? model.state.selectedId ?? null;
    const searchTargetId = options.searchTargetId ?? model.state.searchTargetId ?? null;
    const priorityIds = [...new Set([selectedId, searchTargetId].filter(Boolean))];
    drawGraphScene(surface, prepared, {
      selectedId,
      selection: { color: '#fbbf24', width: 2.5, gap: 4 }
    });
    if (searchTargetId && prepared.nodes.has(searchTargetId)) {
      const node = prepared.nodes.get(searchTargetId);
      const ctx = surface.context;
      ctx.save();
      ctx.strokeStyle = '#60A5FA';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      if (node.shape === 'diamond') {
        const r = node.radius + 6;
        ctx.moveTo(node.center.x, node.center.y - r);
        ctx.lineTo(node.center.x + r, node.center.y);
        ctx.lineTo(node.center.x, node.center.y + r);
        ctx.lineTo(node.center.x - r, node.center.y);
        ctx.closePath();
      } else {
        ctx.arc(node.center.x, node.center.y, node.radius + 6, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
    const metrics = labels.update({
      scene: prepared,
      presentation,
      priorityIds,
      selectedId,
      rootId: scene.folder.id
    });
    const snapshot = createHitSnapshot(prepared);
    current = { model, scene: prepared, presentationScene: scene, prepared, snapshot, projection, metrics, selectedId, searchTargetId, nodeKinds, presentation };
    return {
      scene: prepared,
      snapshot,
      metrics,
      nodeCount: prepared.nodes.size,
      edgeCount: prepared.edges.length,
      proxyCount: scene.items.filter((item) => item.proxy).length,
      labelCount: metrics.visibleCount,
      mode: scene.mode,
      folderId: scene.folder.id,
      searchTargetId
    };
  }

  function hitTest(x, y) {
    if (!current) return null;
    return hitTestNode(current.snapshot, { x, y });
  }

  function labelAtPoint(clientX, clientY) {
    const hit = labels.labelAtPoint(clientX, clientY);
    if (!hit) return null;
    const group = labels.getMetrics().labels.get(hit.id);
    return group && group.style.pointerEvents !== 'none' ? hit.id : null;
  }

  function labelStats() {
    if (!current) return null;
    const boxes = [];
    for (const [id, group] of current.metrics.labels) {
      if (group.style.display === 'none' || group.style.visibility === 'hidden') continue;
      const rect = group.getBoundingClientRect();
      if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) continue;
      boxes.push({ id, priority: current.metrics.priorityIds?.includes?.(id) || id === current.selectedId || id === current.searchTargetId, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, font: getComputedStyle(group).font });
    }
    const hostRect = host.getBoundingClientRect();
    const clipped = boxes.filter((box) => box.left < hostRect.left || box.top < hostRect.top || box.right > hostRect.right || box.bottom > hostRect.bottom).map((box) => box.id);
    const collisions = [];
    for (let i = 0; i < boxes.length; i += 1) {
      if (!boxes[i].priority) continue;
      for (let j = 0; j < boxes.length; j += 1) {
        if (i === j) continue;
        const a = boxes[i]; const b = boxes[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) collisions.push([a.id, b.id]);
      }
    }
    return { labels: boxes.length, priority: boxes.filter((box) => box.priority).length, clipped, priorityCollisions: collisions, fontSizes: [...new Set(boxes.map((box) => box.font))], host: { width: hostRect.width, height: hostRect.height } };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    labels.destroy();
    surface.destroy();
    current = null;
  }

  return { render, hitTest, labelAtPoint, labelStats, surface, labels, get current() { return current; }, dispose };
}






