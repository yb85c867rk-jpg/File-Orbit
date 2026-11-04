export const LAYOUT_WIDTH = 1600;
export const LAYOUT_HEIGHT = 900;
export const ORDINARY_LABEL_LIMIT = 12;

function badgeFor(node) {
  if (!node || node.kind === 'folder') return '폴더';
  const name = String(node.name || '');
  const extension = name.includes('.') ? name.split('.').pop().toUpperCase() : 'FILE';
  return extension.slice(0, 4) || 'FILE';
}

export function layoutScene(scene, { width = LAYOUT_WIDTH, height = LAYOUT_HEIGHT, padding = 80, priorityIds = [] } = {}) {
  const center = { x: width / 2, y: height / 2 };
  const nodes = [];
  const items = scene.items;
  const priority = new Set(priorityIds);
  const ordinaryIds = items.filter((item) => !priority.has(item.id)).map((item) => item.id);
  const ordinaryBudget = Math.min(ORDINARY_LABEL_LIMIT, ordinaryIds.length);
  const labelIds = new Set(priority);
  for (let index = 0; index < ordinaryBudget; index += 1) {
    const pick = ordinaryIds[Math.min(ordinaryIds.length - 1, Math.floor(index * ordinaryIds.length / ordinaryBudget))];
    labelIds.add(pick);
  }
  const ringCount = items.length <= 26 ? 1 : Math.ceil(items.length / 24);
  const maxRadius = Math.max(120, Math.min(width, height) / 2 - padding);
  const baseCount = Math.floor(items.length / ringCount);
  const remainder = items.length % ringCount;
  let cursor = 0;
  for (let ring = 0; ring < ringCount; ring += 1) {
    const count = baseCount + (ring < remainder ? 1 : 0);
    const ringStart = cursor;
    const radius = ringCount === 1 ? Math.min(maxRadius, 280) : 150 + ring * (maxRadius - 150) / (ringCount - 1);
    for (let i = 0; i < count; i += 1) {
      const item = items[ringStart + i];
      const theta = -Math.PI / 2 + (i / count) * Math.PI * 2;
      const x = center.x + Math.cos(theta) * radius;
      const y = center.y + Math.sin(theta) * radius;
      const isCluster = item.proxy === true;
      const isFolder = !isCluster && item.node?.kind === 'folder';
      const glyphRadius = isCluster ? 18 : isFolder ? 12 : 9;
      const isPriority = priority.has(item.id);
      const showLabel = labelIds.has(item.id);
      nodes.push({
        id: item.id,
        proxy: isCluster,
        name: isCluster ? item.cluster.label : item.node.name,
        kind: isCluster ? 'cluster' : item.node.kind,
        badge: isCluster ? '묶음' : badgeFor(item.node),
        memberCount: isCluster ? item.cluster.count : null,
        x, y, radius: glyphRadius,
        labelX: x + (Math.cos(theta) >= 0 ? 14 : -14),
        labelAnchor: Math.cos(theta) >= 0 ? 'start' : 'end',
        labelY: y + 4,
        ring, theta, priority: isPriority, showLabel
      });
      cursor += 1;
    }
  }
  const centerNode = {
    id: scene.folder.id,
    proxy: false,
    name: scene.folder.name,
    kind: 'folder',
    badge: '현재 폴더',
    x: center.x,
    y: center.y,
    radius: 18,
    labelX: center.x + 20,
    labelAnchor: 'start',
    labelY: center.y + 4,
    centerNode: true,
    priority: true,
    showLabel: true
  };
  const all = [centerNode, ...nodes];
  return { width, height, center, centerNode, nodes, all, bounds: boundsOf(all), sceneMode: scene.mode, clusterCount: scene.clusters.length, ringCount, ordinaryLabelLimit: ORDINARY_LABEL_LIMIT };
}

function boundsOf(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius + 220);
    maxY = Math.max(maxY, node.y + node.radius + 24);
  }
  return { minX, minY, maxX, maxY };
}

/** Deterministic nearest displayed-node hit test, including the center folder. */
export function hitTestLayout(layout, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of layout.all) {
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance <= node.radius + 10 && distance < bestDistance) { best = node.id; bestDistance = distance; }
  }
  return best;
}

