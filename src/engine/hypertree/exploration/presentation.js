export const FOLDER_RADIUS_BASE_CSS = 12;
export const FOLDER_RADIUS_RATIO = 0.8;
export const FOLDER_RADIUS_MIN_CSS = 4;
export const EXPLORATION_COLORS = Object.freeze({
  root: '#F8FAFC',
  folderDepth1: '#D1D5DB',
  folderDeep: '#B8BEC7',
  data: '#22C55E',
  pdf: '#F87171',
  edge: '#454B54'
});
export function folderRadiusForDepth(depth) {
  const value = Number.isSafeInteger(depth) && depth >= 0 ? depth : 0;
  return Math.max(FOLDER_RADIUS_MIN_CSS, Number((FOLDER_RADIUS_BASE_CSS * FOLDER_RADIUS_RATIO ** value).toFixed(6)));
}
export function buildExplorationPresentation({ baseLayout, graph }) {
  const radii = new Map();
  const styles = new Map();
  for (const [id, node] of graph.nodes) {
    const depth = baseLayout.depths.get(id);
    if (node.kind === 'folder') {
      radii.set(id, folderRadiusForDepth(depth));
      const fill = id === baseLayout.rootId ? EXPLORATION_COLORS.root : depth === 1 ? EXPLORATION_COLORS.folderDepth1 : EXPLORATION_COLORS.folderDeep;
      styles.set(id, { fill, stroke: fill });
    } else {
      radii.set(id, 4);
      styles.set(id, { fill: EXPLORATION_COLORS.data, stroke: EXPLORATION_COLORS.data, shape: 'circle' });
    }
  }
  return {
    radii, styles,
    presentation: {
      rootFill: EXPLORATION_COLORS.root,
      rootStroke: EXPLORATION_COLORS.root,
      folderFill: EXPLORATION_COLORS.folderDeep,
      folderStroke: EXPLORATION_COLORS.folderDepth1,
      fileFill: EXPLORATION_COLORS.data,
      fileStroke: EXPLORATION_COLORS.data,
      edgeStroke: EXPLORATION_COLORS.edge
    }
  };
}





