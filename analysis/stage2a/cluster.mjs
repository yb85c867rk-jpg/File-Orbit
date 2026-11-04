function summaryNode(node) {
  return { id: node.id, kind: node.kind, name: node.name, data: { ...node.data }, children: [] };
}
function clusterNodes(tree, clusterSize, memberMap) {
  const clusters = [];
  let clusterIndex = 0;
  for (let index = 0; index < tree.children.length; index += clusterSize) {
    const members = tree.children.slice(index, index + clusterSize);
    const clusterId = `cluster:${tree.id}:${clusterIndex}`;
    clusterIndex += 1;
    memberMap.set(clusterId, members.map((member) => member.id));
    clusters.push({
      id: clusterId,
      kind: 'folder',
      name: `묶음 ${clusterIndex} (${members.length}개)`,
      data: { cluster: true, memberCount: members.length },
      members
    });
  }
  return clusters;
}
function materialize(cluster, expanded) {
  return {
    id: cluster.id,
    kind: 'folder',
    name: cluster.name,
    data: { ...cluster.data },
    children: expanded ? cluster.members.map(summaryNode) : []
  };
}
export function buildClusterOverview(tree, { clusterSize = 40 } = {}) {
  if (!Number.isSafeInteger(clusterSize) || clusterSize < 2) throw new Error('clusterSize must be an integer >= 2');
  const memberMap = new Map();
  const clusters = clusterNodes(tree, clusterSize, memberMap);
  const root = summaryNode(tree);
  root.children = clusters.map((cluster) => materialize(cluster, false));
  return { tree: root, memberMap, clusterCount: clusters.length };
}
export function buildClusterFocus(tree, clusterIndex, { clusterSize = 40, includeSiblingClusters = false } = {}) {
  const memberMap = new Map();
  const clusters = clusterNodes(tree, clusterSize, memberMap);
  if (!Number.isSafeInteger(clusterIndex) || clusterIndex < 0 || clusterIndex >= clusters.length) throw new Error('clusterIndex out of range');
  const root = summaryNode(tree);
  const selected = materialize(clusters[clusterIndex], true);
  root.children = includeSiblingClusters
    ? clusters.map((cluster, index) => index === clusterIndex ? selected : materialize(cluster, false))
    : [selected];
  return { tree: root, memberMap, clusterCount: clusters.length, focusedClusterIndex: clusterIndex, includeSiblingClusters };
}
