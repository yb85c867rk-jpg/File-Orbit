export function validateClusterSize(value) {
  if (!Number.isSafeInteger(value) || value < 2 || value > 500) {
    throw new RangeError('clusterSize must be an integer between 2 and 500');
  }
  return value;
}
export function validatePageSize(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new RangeError('searchPageSize must be an integer between 1 and 200');
  }
  return value;
}

function keyFor(node) { return node.id; }

export class LodPresentationModel {
  constructor(root, { clusterSize = 40, searchPageSize = 50, clusterPageSize = null } = {}) {
    if (!root || typeof root !== 'object' || typeof root.id !== 'string') throw new TypeError('a document root is required');
    this.root = root;
    this.clusterSize = validateClusterSize(clusterSize);
    this.searchPageSize = validatePageSize(searchPageSize);
    this.clusterPageSize = clusterPageSize === null ? this.clusterSize : validatePageSize(clusterPageSize);
    this.index = new Map();
    this.order = [];
    this.clustersByParent = new Map();
    this.proxyById = new Map();
    this.documentIds = new Set();
    this.proxySequence = 0;
    this._buildIndex();
    this._buildClusters();
    this.state = {
      folderId: this.root.id,
      folderPage: 1,
      expandedClusterId: null,
      clusterPage: 1,
      selectedId: null,
      searchTargetId: null,
      query: '',
      searchPage: 1,
      searchTotal: 0,
      searchPages: 0,
      history: []
    };
  }

  _buildIndex() {
    const stack = [{ node: this.root, parent: null, path: [], depth: 0, siblingIndex: 0 }];
    while (stack.length) {
      const entry = stack.pop();
      const { node, parent, path, depth, siblingIndex } = entry;
      if (!node || typeof node.id !== 'string' || !node.id) throw new TypeError('every document node requires a non-empty string id');
      if (this.index.has(node.id)) throw new TypeError(`duplicate document id: ${node.id}`);
      this.documentIds.add(node.id);
      const record = { node, parent, depth, siblingIndex, path: [...path, node.name], pathIds: [...(parent ? this.index.get(parent.id).pathIds : []), node.id] };
      this.index.set(node.id, record);
      this.order.push(node.id);
      const children = Array.isArray(node.children) ? node.children : [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: children[i], parent: node, path: record.path, depth: depth + 1, siblingIndex: i });
      }
    }
  }

  _newProxyId(parent, start, count) {
    const base = `proxy:${parent.id}:${start}:${count}`;
    let candidate = base;
    let suffix = 1;
    while (this.documentIds.has(candidate) || this.proxyById.has(candidate)) {
      candidate = `${base}~${suffix}`;
      suffix += 1;
      if (suffix > 100000) throw new Error('proxy id allocation failed');
    }
    return candidate;
  }

  _buildClusters() {
    for (const [id, record] of this.index) {
      const children = record.node.children || [];
      if (children.length <= this.clusterSize) continue;
      const clusters = [];
      for (let start = 0; start < children.length; start += this.clusterSize) {
        const members = children.slice(start, start + this.clusterSize);
        const proxyId = this._newProxyId(record.node, start, members.length);
        const cluster = {
          id: proxyId,
          proxy: true,
          parentId: id,
          start,
          count: members.length,
          memberIds: members.map((member) => member.id),
          label: `묶음 ${clusters.length + 1} (${members.length}개)`
        };
        clusters.push(cluster);
        this.proxyById.set(proxyId, cluster);
        this.proxySequence += 1;
      }
      this.clustersByParent.set(id, clusters);
    }
  }

  documentIdsList() { return [...this.documentIds]; }
  deepestId() { let best = null; for (const [id, record] of this.index) if (!best || record.depth > this.index.get(best).depth) best = id; return best; }
  proxyIdsList() { return [...this.proxyById.keys()]; }
  documentRecord(id) { return this.index.get(id) || null; }
  proxyRecord(id) { return this.proxyById.get(id) || null; }
  isProxy(id) { return this.proxyById.has(id); }

  _clusterForChild(parentId, siblingIndex) {
    const clusters = this.clustersByParent.get(parentId) || [];
    return clusters.find((cluster) => siblingIndex >= cluster.start && siblingIndex < cluster.start + cluster.count) || null;
  }

  _pushHistory() {
    const s = this.state;
    s.history.push({ folderId: s.folderId, folderPage: s.folderPage, expandedClusterId: s.expandedClusterId, clusterPage: s.clusterPage, selectedId: s.selectedId, searchTargetId: s.searchTargetId });
    if (s.history.length > 100) s.history.shift();
  }

  currentFolderRecord() { return this.index.get(this.state.folderId) || this.index.get(this.root.id); }

  breadcrumb() {
    const record = this.currentFolderRecord();
    const crumbs = record.pathIds.map((id) => ({ id, name: this.index.get(id).node.name }));
    if (this.state.expandedClusterId) {
      const cluster = this.proxyById.get(this.state.expandedClusterId);
      if (cluster) crumbs.push({ id: cluster.id, name: cluster.label, proxy: true, count: cluster.count });
    }
    return crumbs;
  }

  _page(total, requested) {
    const pageSize = Math.min(this.clusterPageSize, Math.max(1, total));
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return { pageSize, pages, page: Math.min(Math.max(1, Number.isSafeInteger(requested) ? requested : 1), pages) };
  }

  buildScene() {
    const folder = this.currentFolderRecord();
    const children = folder.node.children || [];
    const items = [];
    const base = { folder: { id: folder.node.id, name: folder.node.name, record: folder } };
    if (this.state.expandedClusterId) {
      const cluster = this.proxyById.get(this.state.expandedClusterId);
      if (!cluster || cluster.parentId !== folder.node.id) throw new Error('expanded cluster is not in the current folder');
      const paging = this._page(cluster.memberIds.length, this.state.clusterPage || 1);
      this.state.clusterPage = paging.page;
      const start = (paging.page - 1) * paging.pageSize;
      for (const id of cluster.memberIds.slice(start, start + paging.pageSize)) {
        const record = this.index.get(id);
        items.push({ id, proxy: false, node: record.node, record });
      }
      return { ...base, items, mode: 'cluster', cluster, page: paging.page, pages: paging.pages, pageSize: paging.pageSize, total: cluster.memberIds.length, clusterPage: paging.page, clusterPages: paging.pages, clusterPageSize: paging.pageSize, clusterTotal: cluster.memberIds.length, clusters: this.clustersByParent.get(folder.node.id) || [] };
    }
    if (children.length > this.clusterSize) {
      const clusters = this.clustersByParent.get(folder.node.id) || [];
      const paging = this._page(clusters.length, this.state.folderPage || 1);
      this.state.folderPage = paging.page;
      const start = (paging.page - 1) * paging.pageSize;
      for (const cluster of clusters.slice(start, start + paging.pageSize)) items.push({ id: cluster.id, proxy: true, cluster });
      return { ...base, items, mode: 'overview', cluster: null, clusters, page: paging.page, pages: paging.pages, pageSize: paging.pageSize, total: clusters.length };
    }
    const paging = this._page(children.length, this.state.folderPage || 1);
    this.state.folderPage = paging.page;
    const start = (paging.page - 1) * paging.pageSize;
    for (const child of children.slice(start, start + paging.pageSize)) items.push({ id: child.id, proxy: false, node: child, record: this.index.get(child.id) });
    return { ...base, items, mode: 'folder', cluster: null, clusters: [], page: paging.page, pages: paging.pages, pageSize: paging.pageSize, total: children.length };
  }

  select(id) {
    if (this.proxyById.has(id)) { this.state.selectedId = id; this.state.searchTargetId = null; return this.details(); }
    if (!this.index.has(id)) throw new RangeError(`unknown node: ${id}`);
    this.state.selectedId = id;
    return this.details();
  }

  enterFolder(id) {
    return this.navigateToFolder(id);
  }

  navigateToFolder(id) {
    if (this.proxyById.has(id)) throw new TypeError('a visual cluster is not a document folder');
    const record = this.index.get(id);
    if (!record) throw new RangeError(`unknown node: ${id}`);
    if (record.node.kind !== 'folder') throw new TypeError('only document folders can be entered');
    this._pushHistory();
    this.state.folderId = id;
    this.state.folderPage = 1;
    this.state.expandedClusterId = null;
    this.state.clusterPage = 1;
    this.state.selectedId = null;
    this.state.searchTargetId = null;
    return this.buildScene();
  }

  expandCluster(id, page = 1) {
    if (!this.proxyById.has(id)) throw new RangeError(`unknown visual group: ${id}`);
    const cluster = this.proxyById.get(id);
    if (cluster.parentId !== this.state.folderId) throw new TypeError('visual group is not in the current folder');
    this._pushHistory();
    this.state.expandedClusterId = id;
    this.state.clusterPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    this.state.selectedId = null;
    this.state.searchTargetId = null;
    return this.buildScene();
  }

  _pruneSelection(scene) {
    if (this.state.selectedId && this.state.selectedId !== this.state.folderId && !scene.items.some((item) => item.id === this.state.selectedId)) this.state.selectedId = null;
    if (this.state.searchTargetId && !scene.items.some((item) => item.id === this.state.searchTargetId)) this.state.searchTargetId = null;
    return scene;
  }

  setFolderPage(page) {
    if (this.state.expandedClusterId) return this.buildScene();
    this.state.folderPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    return this._pruneSelection(this.buildScene());
  }

  setClusterPage(page) {
    if (!this.state.expandedClusterId) return this.buildScene();
    const cluster = this.proxyById.get(this.state.expandedClusterId);
    const pages = Math.max(1, Math.ceil(cluster.memberIds.length / Math.min(this.clusterPageSize, cluster.memberIds.length)));
    this.state.clusterPage = Math.min(Math.max(1, Number.isSafeInteger(page) ? page : 1), pages);
    return this._pruneSelection(this.buildScene());
  }
  overview() {
    this._pushHistory();
    const cluster = this.state.expandedClusterId ? this.proxyById.get(this.state.expandedClusterId) : null;
    if (cluster) {
      const clusters = this.clustersByParent.get(this.state.folderId) || [];
      const index = clusters.findIndex((entry) => entry.id === cluster.id);
      this.state.folderPage = Math.floor(Math.max(0, index) / this.clusterPageSize) + 1;
    }
    this.state.expandedClusterId = null;
    this.state.clusterPage = 1;
    this.state.selectedId = null;
    this.state.searchTargetId = null;
    return this.buildScene();
  }

  back() {
    const s = this.state;
    if (!s.history.length) {
      if (s.expandedClusterId) { s.expandedClusterId = null; s.clusterPage = 1; s.folderPage = 1; s.searchTargetId = null; return this.buildScene(); }
      return this.buildScene();
    }
    const previous = s.history.pop();
    s.folderId = previous.folderId;
    s.folderPage = previous.folderPage || 1;
    s.expandedClusterId = previous.expandedClusterId;
    s.clusterPage = previous.clusterPage || 1;
    s.selectedId = previous.selectedId;
    s.searchTargetId = previous.searchTargetId;
    return this._restoreScene();
  }

  _restoreScene() {
    return this._pruneSelection(this.buildScene());
  }

  revealNode(id) {
    const record = this.index.get(id);
    if (!record) throw new RangeError(`unknown node: ${id}`);
    this._pushHistory();
    if (!record.parent) {
      this.state.folderId = this.root.id;
      this.state.expandedClusterId = null;
      this.state.selectedId = id;
      this.state.searchTargetId = id;
      return this.buildScene();
    }
    const parent = record.parent;
    this.state.folderId = parent.id;
    const parentChildren = parent.children || [];
    const cluster = parentChildren.length > this.clusterSize ? this._clusterForChild(parent.id, record.siblingIndex) : null;
    this.state.expandedClusterId = cluster?.id || null;
    this.state.clusterPage = cluster ? Math.floor((record.siblingIndex - cluster.start) / this.clusterPageSize) + 1 : 1;
    this.state.folderPage = cluster ? 1 : Math.floor(record.siblingIndex / this.clusterPageSize) + 1;
    this.state.selectedId = id;
    this.state.searchTargetId = id;
    return this.buildScene();
  }

  search(query, page = 1) {
    const text = String(query ?? '').trim().toLowerCase();
    if (!text) {
      this.state.query = ''; this.state.searchPage = 1; this.state.searchTotal = 0; this.state.searchPages = 0; this.state.searchTargetId = null;
      return { query: '', page: 1, pageSize: this.searchPageSize, total: 0, pages: 0, results: [] };
    }
    if (String(query ?? '') !== this.state.query) this.state.searchTargetId = null;
    const matches = [];
    for (const id of this.order) {
      const record = this.index.get(id);
      const haystack = `${record.node.name} ${id} ${record.path.join(' / ')}`.toLowerCase();
      if (haystack.includes(text)) matches.push({ id, name: record.node.name, kind: record.node.kind, path: record.path.join(' / '), proxy: false });
    }
    const pages = Math.ceil(matches.length / this.searchPageSize);
    const safePage = pages === 0 ? 1 : Math.min(Math.max(1, Number.isSafeInteger(page) ? page : 1), pages);
    const start = (safePage - 1) * this.searchPageSize;
    this.state.query = String(query ?? ''); this.state.searchPage = safePage; this.state.searchTotal = matches.length; this.state.searchPages = pages;
    return { query: String(query ?? ''), page: safePage, pageSize: this.searchPageSize, total: matches.length, pages, results: matches.slice(start, start + this.searchPageSize) };
  }

  revealSearchResult(id) {
    const record = this.index.get(id);
    if (!record) throw new RangeError(`unknown search result: ${id}`);
    this.revealNode(id);
    return this.details();
  }

  details() {
    const s = this.state;
    if (s.selectedId && this.proxyById.has(s.selectedId)) {
      const cluster = this.proxyById.get(s.selectedId);
      return { kind: 'cluster', id: cluster.id, name: cluster.label, count: cluster.count, parentId: cluster.parentId, proxy: true, canPreview: false, canEdit: false, memberIds: [...cluster.memberIds] };
    }
    if (s.selectedId) {
      const record = this.index.get(s.selectedId);
      return {
        kind: 'document', id: record.node.id, name: record.node.name, nodeKind: record.node.kind,
        path: record.path.join(' / '), depth: record.depth, proxy: false,
        canPreview: record.node.kind === 'file', canEdit: false,
        attachmentId: record.node.data?.attachmentId ?? null
      };
    }
    return null;
  }

  context() {
    return {
      folderId: this.state.folderId, folderPage: this.state.folderPage, expandedClusterId: this.state.expandedClusterId, clusterPage: this.state.clusterPage,
      selectedId: this.state.selectedId, searchTargetId: this.state.searchTargetId,
      searchQuery: this.state.query, searchPage: this.state.searchPage,
      searchTotal: this.state.searchTotal, searchPages: this.state.searchPages,
      breadcrumb: this.breadcrumb()
    };
  }
}

