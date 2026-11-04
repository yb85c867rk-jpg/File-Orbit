/** Search-path presentation tokens. Blue communicates search separately from file type. */
export const SEARCH_HIGHLIGHT_COLOR = '#60A5FA';
export const SEARCH_HIGHLIGHT_EDGE_OPACITY = 0.55;
export const SEARCH_HIGHLIGHT_TOKENS = Object.freeze({
  color: SEARCH_HIGHLIGHT_COLOR,
  edge: SEARCH_HIGHLIGHT_COLOR,
  edgeOpacity: SEARCH_HIGHLIGHT_EDGE_OPACITY,
  dark: Object.freeze({ fill: null, stroke: SEARCH_HIGHLIGHT_COLOR, outline: SEARCH_HIGHLIGHT_COLOR, edge: SEARCH_HIGHLIGHT_COLOR, edgeOpacity: SEARCH_HIGHLIGHT_EDGE_OPACITY }),
  light: Object.freeze({ fill: null, stroke: SEARCH_HIGHLIGHT_COLOR, outline: SEARCH_HIGHLIGHT_COLOR, edge: SEARCH_HIGHLIGHT_COLOR, edgeOpacity: SEARCH_HIGHLIGHT_EDGE_OPACITY })
});

export function searchHighlightToken(theme) {
  return theme === 'light' ? SEARCH_HIGHLIGHT_TOKENS.light : SEARCH_HIGHLIGHT_TOKENS.dark;
}

/** Return a presentation-only scene with matched folder outlines and ancestor edges tinted. */
export function highlightSearchFolderScene(scene, folderIds, theme = 'dark') {
  if (!scene || !(folderIds instanceof Set) || folderIds.size === 0) return scene;
  const token = searchHighlightToken(theme);
  const nodes = new Map();
  for (const [id, node] of scene.nodes) {
    if (node.kind === 'folder' && folderIds.has(id)) {
      nodes.set(id, Object.freeze({ ...node, stroke: token.stroke }));
    } else {
      nodes.set(id, node);
    }
  }
  const edges = scene.edges.map((edge) => (
    folderIds.has(edge.fromId) && folderIds.has(edge.toId)
      ? Object.freeze({ ...edge, stroke: token.edge, opacity: token.edgeOpacity })
      : edge
  ));
  return Object.freeze({ ...scene, nodes, edges });
}

