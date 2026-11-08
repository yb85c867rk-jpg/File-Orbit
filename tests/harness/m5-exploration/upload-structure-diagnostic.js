/**
 * Structure-only Upload diagnostic. Deliberately excludes names, paths,
 * descriptions, attachment IDs and attachment bytes.
 */
export function buildUploadStructureDiagnostic({ preparation = null, diagnostics = null, source = null, context = null } = {}) {
  const candidate = preparation?.candidateTree || null;
  const nodes = [];
  const syntheticById = new Map();
  let folders = 0;
  let files = 0;
  let maxDepth = 0;
  let sequence = 0;
  let rootChildCount = 0;
  const walk = (node, parentSyntheticId, depth) => {
    const syntheticId = 'n' + sequence;
    sequence += 1;
    syntheticById.set(node.id, syntheticId);
    const children = Array.isArray(node.children) ? node.children : [];
    if (depth === 0) rootChildCount = children.length;
    if (node.kind === 'folder') folders += 1; else files += 1;
    maxDepth = Math.max(maxDepth, depth);
    nodes.push({
      id: syntheticId,
      parentId: parentSyntheticId,
      kind: node.kind === 'folder' ? 'folder' : 'file',
      depth,
      directChildCount: children.length
    });
    for (const child of children) walk(child, syntheticId, depth + 1);
  };
  if (candidate) walk(candidate, null, 0);
  const failingActualId = diagnostics?.failingParent?.id || diagnostics?.unsatisfied?.[0]?.parentId || null;
  const failingSyntheticId = failingActualId ? (syntheticById.get(failingActualId) || null) : null;
  return {
    schema: 'fileorbit-upload-structure-diagnostic-v1',
    source,
    candidate: candidate ? {
      nodeCount: nodes.length,
      folderCount: folders,
      fileCount: files,
      maxDepth,
      rootChildCount
    } : null,
    destinationKind: context?.target?.hitKind || null,
    failingParent: failingActualId ? {
      syntheticId: failingSyntheticId,
      actualIdIncluded: false,
      depth: diagnostics?.failingParent?.depth ?? null,
      directChildCount: diagnostics?.failingParent?.directChildCount ?? null
    } : null,
    layout: diagnostics?.layout || null,
    diagnostic: diagnostics ? {
      code: diagnostics.code || null,
      reason: diagnostics.reason || null,
      layout: diagnostics.layout || null,
      failingParent: diagnostics.failingParent ? {
        syntheticId: failingSyntheticId,
        actualIdIncluded: false,
        depth: diagnostics.failingParent.depth ?? null,
        directChildCount: diagnostics.failingParent.directChildCount ?? null
      } : null,
      required: diagnostics.required ?? diagnostics.unsatisfied?.[0]?.required ?? null,
      available: diagnostics.available ?? diagnostics.unsatisfied?.[0]?.available ?? null,
      attemptCount: diagnostics.layout?.attemptCount ?? null,
      candidateCount: diagnostics.layout?.candidateCount ?? null
    } : null,
    nodes
  };
}

export function downloadUploadStructureDiagnostic(diagnostic, { document = globalThis.document, filename = 'fileorbit-upload-structure-diagnostic.json' } = {}) {
  if (!diagnostic || !document) return false;
  const text = JSON.stringify(diagnostic, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}


export function buildDeleteStructureDiagnostic({ tree, targetId, targetName = null, counts = null, diagnostics = null, source = null } = {}) {
  const before = [];
  const candidate = [];
  const syntheticById = new Map();
  let sequence = 0;
  let targetSyntheticId = null;
  const walk = (node, parentSyntheticId, depth, inDeletedSubtree = false) => {
    const syntheticId = 'n' + sequence;
    sequence += 1;
    syntheticById.set(node.id, syntheticId);
    if (node.id === targetId) { targetSyntheticId = syntheticId; inDeletedSubtree = true; }
    const children = Array.isArray(node.children) ? node.children : [];
    const record = { id: syntheticId, parentId: parentSyntheticId, kind: node.kind === 'folder' ? 'folder' : 'file', depth, directChildCount: children.length };
    before.push(record);
    if (!inDeletedSubtree) candidate.push({ ...record });
    for (const child of children) walk(child, syntheticId, depth + 1, inDeletedSubtree);
  };
  if (tree) walk(tree, null, 0, false);
  const failingActualId = diagnostics?.failingParent?.id || diagnostics?.unsatisfied?.[0]?.parentId || null;
  return {
    schema: 'fileorbit-delete-structure-diagnostic-v1',
    source,
    operation: {
      targetSyntheticId,
      actualIdIncluded: false,
      deletedFolders: counts?.folders ?? null,
      deletedFiles: counts?.files ?? null,
      beforeNodeCount: before.length,
      candidateNodeCount: candidate.length,
      failingParentSyntheticId: failingActualId ? (syntheticById.get(failingActualId) || null) : null
    },
    layout: diagnostics?.layout || null,
    diagnostic: diagnostics ? {
      code: diagnostics.code || null,
      reason: diagnostics.reason || null,
      layout: diagnostics.layout || null,
      failingParent: diagnostics.failingParent ? {
        syntheticId: failingActualId ? (syntheticById.get(failingActualId) || null) : null,
        actualIdIncluded: false,
        depth: diagnostics.failingParent.depth ?? null,
        directChildCount: diagnostics.failingParent.directChildCount ?? null
      } : null,
      required: diagnostics.required ?? diagnostics.unsatisfied?.[0]?.required ?? null,
      available: diagnostics.available ?? diagnostics.unsatisfied?.[0]?.available ?? null,
      attemptCount: diagnostics.layout?.attemptCount ?? null,
      candidateCount: diagnostics.layout?.candidateCount ?? null
    } : null,
    before,
    candidate
  };
}
