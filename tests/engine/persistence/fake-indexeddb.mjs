// Test-only IndexedDB-compatible subset. It stages transactions and commits on
// a timer so promise-based request chaining behaves like browser IDB. It does
// not model browser durability, disk quotas, cross-process blocking, or real
// version upgrade lock queues. Native browser evidence remains separate.
function clone(value) {
  if (value === undefined) return undefined;
  try { return structuredClone(value); } catch { return value; }
}
function keyFor(value, keyPath) {
  if (Array.isArray(keyPath)) return JSON.stringify(keyPath.map((part) => value[part]));
  return value[keyPath];
}
function sameKey(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => value === right[index]);
  return left === right;
}
function sameIndexKey(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left) === JSON.stringify(right);
  return left === right;
}
class FakeRequest {
  constructor() { this.onsuccess = null; this.onerror = null; this.result = undefined; this.error = null; }
}
class FakeObjectStore {
  constructor(transaction, name, definition) { this.transaction = transaction; this.name = name; this.keyPath = definition.keyPath; }
  get(key) { return this.transaction._read(this.name, key, null); }
  getAll(query = undefined) { return this.transaction._readAll(this.name, query); }
  createIndex(name, keyPath) { const definition = this.transaction._staged.get(this.name).definition; definition.indexes.set(name, { name, keyPath }); return { name, keyPath }; }
  get indexNames() { return new FakeIndexNames(this.transaction._staged.get(this.name).definition.indexes); }
  put(value) { return this.transaction._write(this.name, 'put', clone(value)); }
  delete(key) { return this.transaction._write(this.name, 'delete', key); }
  index(name) { return { getAll: (query) => this.transaction._readAll(this.name, query, name) }; }
}
class FakeTransaction {
  constructor(database, storeNames, mode = 'readonly') {
    this.database = database; this.mode = mode; this.storeNames = [...storeNames];
    this.oncomplete = null; this.onerror = null; this.onabort = null; this.error = null;
    this._aborted = false; this._finished = false; this._timer = null;
    this._staged = new Map();
    for (const name of this.storeNames) {
      if (!database._stores.has(name)) throw new Error(`missing store ${name}`);
      const store = database._stores.get(name);
      const copy = new Map();
      for (const [key, value] of store.records) copy.set(key, clone(value));
      this._staged.set(name, { definition: store.definition, records: copy });
    }
    this._schedule();
  }
  objectStore(name) {
    if (!this.storeNames.includes(name)) {
      const existing = this.database._stores.get(name);
      if (!existing) throw new Error(`store ${name} not in transaction scope`);
      this.storeNames.push(name);
      const copy = new Map();
      for (const [key, value] of existing.records) copy.set(key, clone(value));
      this._staged.set(name, { definition: existing.definition, records: copy });
    }
    return new FakeObjectStore(this, name, this._staged.get(name).definition);
  }
  abort() {
    if (this._finished || this._aborted) return;
    this._aborted = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    queueMicrotask(() => { if (!this._finished) { this._finished = true; this.onabort?.({ target: this }); } });
  }
  _schedule() {
    if (this._aborted || this._finished) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._commit(), 0);
  }
  _commit() {
    if (this._aborted || this._finished) return;
    this._finished = true;
    if (this.mode === 'readwrite') {
      for (const [name, staged] of this._staged) this.database._stores.get(name).records = staged.records;
    }
    this.oncomplete?.({ target: this });
  }
  _request(operation) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      if (this._aborted || this._finished) {
        request.error = Object.assign(new Error('transaction inactive'), { name: 'TransactionInactiveError' });
        request.onerror?.({ target: request });
        return;
      }
      try {
        request.result = operation();
        request.onsuccess?.({ target: request });
        this._schedule();
      } catch (error) {
        this.error = error;
        request.error = error;
        request.onerror?.({ target: request });
        this.abort();
      }
    });
    return request;
  }
  _read(storeName, key) {
    const normalized = Array.isArray(key) ? JSON.stringify(key) : key;
    return this._request(() => clone(this._staged.get(storeName).records.get(normalized)));
  }
  _readAll(storeName, query = undefined, indexName = null) {
    return this._request(() => {
      const staged = this._staged.get(storeName);
      let values = [...staged.records.values()];
      if (indexName) {
        const index = staged.definition.indexes.get(indexName);
        if (!index) throw new Error(`missing index ${indexName}`);
        values = values.filter((value) => sameIndexKey(value[index.keyPath], query));
      } else if (query !== undefined) {
        values = values.filter((value) => sameKey(keyFor(value, staged.definition.keyPath), query));
      }
      return clone(values);
    });
  }
  _write(storeName, operation, valueOrKey) {
    return this._request(() => {
      if (this.mode !== 'readwrite' && this.mode !== 'versionchange') throw Object.assign(new Error('readonly transaction'), { name: 'ReadOnlyError' });
      if (this.database.factory?.failNextWrite === storeName) { this.database.factory.failNextWrite = null; throw new Error('injected write failure'); }
      const staged = this._staged.get(storeName);
      if (operation === 'put') {
        const key = keyFor(valueOrKey, staged.definition.keyPath);
        staged.records.set(key, valueOrKey);
        return key;
      }
      if (operation === 'delete') { staged.records.delete(Array.isArray(valueOrKey) ? JSON.stringify(valueOrKey) : valueOrKey); return undefined; }
      throw new Error(`unsupported write ${operation}`);
    });
  }
}
class FakeObjectStoreNames {
  constructor(iterator) { this._iterator = iterator; }
  contains(name) { return [...this._iterator()].includes(name); }
  [Symbol.iterator]() { return this._iterator(); }
}
class FakeIndexNames {
  constructor(map) { this._map = map; }
  contains(name) { return this._map.has(name); }
}
class FakeTransactionStoreHandle {
  constructor(transaction, name) { this.transaction = transaction; this.name = name; }
  createIndex(name, keyPath) {
    const staged = this.transaction._staged.get(this.name);
    staged.definition.indexes.set(name, { name, keyPath });
    return { name, keyPath };
  }
}
class FakeUpgradeTransaction extends FakeTransaction {
  createObjectStore(name, options = {}) {
    const definition = { keyPath: options.keyPath, indexes: new Map() };
    this.database._stores.set(name, { definition, records: new Map() });
    this.storeNames.push(name);
    this._staged.set(name, { definition, records: new Map() });
    return new FakeTransactionStoreHandle(this, name);
  }
}
class FakeDatabase {
  constructor(name, version, factory = null) {
    this.factory = factory;
    this.name = name; this.version = version; this._stores = new Map(); this.closed = false;
    this.onversionchange = null; this.onclose = null;
    this.objectStoreNames = new FakeObjectStoreNames(() => [...this._stores.keys()].sort());
  }
  createObjectStore(name, options = {}) {
    const definition = { keyPath: options.keyPath, indexes: new Map() };
    this._stores.set(name, { definition, records: new Map() });
    return new FakeTransactionStoreHandle(null, name);
  }
  transaction(storeNames, mode = 'readonly') {
    if (this.closed) throw Object.assign(new Error('database closed'), { name: 'InvalidStateError' });
    return new FakeTransaction(this, Array.isArray(storeNames) ? storeNames : [storeNames], mode);
  }
  close() { this.closed = true; this.onclose?.(); }
}
export class FakeIndexedDB {
  constructor() { this.databases = new Map(); this.failOpen = false; this.failNextWrite = null; this.blockNextOpen = false; this.pendingBlocked = []; }
  open(name, version) {
    const request = new FakeRequest();
    if (this.failOpen) {
      request.error = Object.assign(new Error('open denied'), { name: 'InvalidStateError' });
      queueMicrotask(() => request.onerror?.({ target: request }));
      return request;
    }
    const existing = this.databases.get(name);
    const targetVersion = version ?? existing?.version ?? 1;
    if (existing && targetVersion < existing.version) {
      request.error = Object.assign(new Error('version error'), { name: 'VersionError' });
      queueMicrotask(() => request.onerror?.({ target: request }));
      return request;
    }
    if (existing?.closed) existing.closed = false;
    if (this.blockNextOpen>0) { this.blockNextOpen -= 1; const blockedDb = existing || new FakeDatabase(name, targetVersion, this); request.result = blockedDb; this.pendingBlocked.push({ request, database: blockedDb }); queueMicrotask(() => request.onblocked?.({ target: request })); return request; }
    const previousVersion = existing?.version ?? 0;
    const database = existing || new FakeDatabase(name, 0, this);
    database.version = targetVersion;
    this.databases.set(name, database);
    request.result = database;
    const upgrade = targetVersion > previousVersion;
    if (upgrade) {
      const tx = new FakeUpgradeTransaction(database, [], 'versionchange');
      request.transaction = tx;
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: request, oldVersion: previousVersion, newVersion: targetVersion });
        tx._schedule();
        tx.oncomplete = () => queueMicrotask(() => request.onsuccess?.({ target: request }));
      });
    } else {
      queueMicrotask(() => request.onsuccess?.({ target: request }));
    }
    return request;
  }
  releaseBlockedOpen() {
    const pending = this.pendingBlocked.shift();
    if (!pending) return false;
    queueMicrotask(() => pending.request.onsuccess?.({ target: pending.request }));
    return true;
  }
  deleteDatabase(name) {
    const request = new FakeRequest();
    const database = this.databases.get(name);
    if (database) { database.close(); this.databases.delete(name); }
    queueMicrotask(() => request.onsuccess?.({ target: request }));
    return request;
  }
  fireVersionChange(name) {
    const database = this.databases.get(name);
    if (database?.onversionchange) database.onversionchange({ target: database, newVersion: database.version + 1 });
  }
}
export function createBlob(text, type = 'text/plain') { return new Blob([text], { type }); }





