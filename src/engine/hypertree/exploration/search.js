export const MAX_SEARCH_QUERY_CODE_POINTS = 200;
export const MAX_SEARCH_RESULTS = 50;

export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFC').toLowerCase();
}

function normalizeQuery(value) {
  return normalizeSearchText(value).trim();
}

function termsFor(query) {
  return normalizeQuery(query).split(/\s+/u).filter(Boolean);
}

function matchBucket(name, description, terms, normalizedQuery) {
  const normalizedName = normalizeSearchText(name);
  const normalizedDescription = normalizeSearchText(description);
  const haystack = normalizedName + '\n' + normalizedDescription;
  if (!terms.every((term) => haystack.includes(term))) return null;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (terms.every((term) => normalizedName.includes(term))) return 2;
  return 3;
}

/** Search the authoritative tree, including hidden branches. */
export function searchTree(tree, query, { maxResults = MAX_SEARCH_RESULTS, datasetToken = null, revision = null } = {}) {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length > MAX_SEARCH_QUERY_CODE_POINTS) {
    return { ok: false, reason: 'query-too-long', message: `Search is limited to ${MAX_SEARCH_QUERY_CODE_POINTS} characters.`, query: normalizedQuery, results: [], total: 0, limited: false, folderIds: [], datasetToken, revision };
  }
  const terms = termsFor(normalizedQuery);
  if (terms.length === 0) return { ok: true, query: '', results: [], total: 0, limited: false, folderIds: [], datasetToken, revision };
  const matches = [];
  const parentById = new Map();
  const walk = (node, parentPath, parentId) => {
    parentById.set(node.id, parentId ?? null);
    const description = typeof node.data?.description === 'string' ? node.data.description : '';
    const bucket = matchBucket(node.name, description, terms, normalizedQuery);
    if (bucket !== null) matches.push({ id: node.id, name: node.name, kind: node.kind, description, parentId, parentPath, bucket, dataType: node.data?.dataType ?? null, classification: node.data?.classification ?? null, link: node.data?.link ?? null, datasetToken, revision });
    for (const child of node.children || []) walk(child, parentPath ? `${parentPath} / ${node.name}` : node.name, node.id);
  };
  walk(tree, '', null);
  matches.sort((left, right) => left.bucket - right.bucket
    || normalizeSearchText(left.name).localeCompare(normalizeSearchText(right.name))
    || left.id.localeCompare(right.id));
  const total = matches.length;
  const limited = total > maxResults;
  const folderIds = new Set();
  const addAncestors = (parentId) => { let current = parentId; while (current != null && !folderIds.has(current)) { folderIds.add(current); current = parentById.get(current) ?? null; } };
  for (const match of matches) {
    if (match.kind === 'folder') folderIds.add(match.id);
    addAncestors(match.parentId);
  }
  return { ok: true, query: normalizedQuery, results: matches.slice(0, maxResults), total, limited, folderIds: [...folderIds].sort(), datasetToken, revision };
}

