import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrbitDirectoryAdapter } from '../../harness/m5-exploration/orbit-directory-adapter.js';

function namedError(name, message = name) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function permissionHandle({ permission = 'granted', requested = 'granted', queryError = null, requestError = null, name = 'Orbit' } = {}) {
  let queryCalls = 0; let requestCalls = 0;
  return {
    name,
    get queryCalls() { return queryCalls; },
    get requestCalls() { return requestCalls; },
    async queryPermission(options) {
      queryCalls += 1;
      assert.deepEqual(options, { mode: 'readwrite' });
      if (queryError) throw queryError;
      return permission;
    },
    async requestPermission(options) {
      requestCalls += 1;
      assert.deepEqual(options, { mode: 'readwrite' });
      if (requestError) throw requestError;
      return requested;
    }
  };
}

function fileHandle(name, { size = 10, lastModified = 1000, kind = 'file', getFileError = null } = {}) {
  let bytesRead = 0; let metadataCalls = 0; let afterRead = null;
  return {
    name, kind,
    get bytesRead() { return bytesRead; },
    get metadataCalls() { return metadataCalls; },
    setAfterRead(fn) { afterRead = fn; },
    async getFile() {
      metadataCalls += 1;
      if (getFileError) throw getFileError;
      if (afterRead) afterRead();
      return {
        name, size, lastModified, type: 'application/x-orbit',
        async arrayBuffer() { bytesRead += 1; return new ArrayBuffer(size); }
      };
    }
  };
}

function directoryHandle(entries = [], { valuesError = null } = {}) {
  let enumerationCalls = 0;
  return {
    name: 'Orbit',
    get enumerationCalls() { return enumerationCalls; },
    async *values() {
      enumerationCalls += 1;
      if (valuesError) throw valuesError;
      for (const entry of entries) yield entry;
    }
  };
}

test('directory capability is independent of file-picker capability', () => {
  assert.equal(createOrbitDirectoryAdapter({ window: {} }).supported, false);
  assert.equal(createOrbitDirectoryAdapter({ window: { showOpenFilePicker() {}, showSaveFilePicker() {} } }).supported, false);
  assert.equal(createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } }).supported, true);
});

test('unsupported pickDirectory does not call a picker', async () => {
  let calls = 0;
  const adapter = createOrbitDirectoryAdapter({ window: { showOpenFilePicker() { calls += 1; } } });
  const result = await adapter.pickDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported');
  assert.equal(result.stage, 'capability');
  assert.equal(calls, 0);
});

test('pickDirectory invokes showDirectoryPicker synchronously and then awaits permission', async () => {
  const gate = deferred(); let called = false; const handle = permissionHandle();
  const adapter = createOrbitDirectoryAdapter({
    window: { showDirectoryPicker(options) { called = true; assert.deepEqual(options, { mode: 'readwrite' }); return gate.promise; } }
  });
  const pending = adapter.pickDirectory();
  assert.equal(called, true, 'picker must be invoked before the first await');
  gate.resolve(handle);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.permission, 'granted');
  assert.equal(handle.queryCalls, 1);
  assert.equal(handle.requestCalls, 0);
});

test('pickDirectory waits for an asynchronous permission query before succeeding', async () => {
  let resolved = false; const gate = deferred();
  const handle = {
    name: 'Orbit',
    async queryPermission() { await gate.promise; return 'granted'; },
    async requestPermission() { throw new Error('request should not be called'); }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { async showDirectoryPicker() { return handle; } } });
  const pending = adapter.pickDirectory().then((result) => { resolved = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  gate.resolve();
  const result = await pending;
  assert.equal(result.ok, true);
});

test('picker cancellation is a typed cancellation', async () => {
  const adapter = createOrbitDirectoryAdapter({ window: { async showDirectoryPicker() { throw namedError('AbortError'); } } });
  const result = await adapter.pickDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.stage, 'picker');
});

test('picker permission prompt requests once and granted passes', async () => {
  const handle = permissionHandle({ permission: 'prompt', requested: 'granted' });
  const adapter = createOrbitDirectoryAdapter({ window: { async showDirectoryPicker() { return handle; } } });
  const result = await adapter.pickDirectory();
  assert.equal(result.ok, true);
  assert.equal(handle.queryCalls, 1);
  assert.equal(handle.requestCalls, 1);
  assert.equal(result.stage, 'ready');
});

test('picker permission denial is typed and does not request again when query is denied', async () => {
  const handle = permissionHandle({ permission: 'denied', requested: 'granted' });
  const adapter = createOrbitDirectoryAdapter({ window: { async showDirectoryPicker() { return handle; } } });
  const result = await adapter.pickDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(handle.queryCalls, 1);
  assert.equal(handle.requestCalls, 0);
});

test('permission request denial is typed', async () => {
  const handle = permissionHandle({ permission: 'prompt', requested: 'denied' });
  const adapter = createOrbitDirectoryAdapter({ window: { async showDirectoryPicker() { return handle; } } });
  const result = await adapter.pickDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(result.stage, 'permission-request');
  assert.equal(handle.requestCalls, 1);
});

test('permission query failure is typed without requesting', async () => {
  const handle = permissionHandle({ queryError: namedError('SecurityError') });
  const adapter = createOrbitDirectoryAdapter({ window: { async showDirectoryPicker() { return handle; } } });
  const result = await adapter.pickDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(result.stage, 'permission-query');
  assert.equal(handle.requestCalls, 0);
});

test('queryWritePermission never requests; requestWritePermission does', async () => {
  const handle = permissionHandle({ permission: 'prompt', requested: 'granted' });
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const queried = await adapter.queryWritePermission(handle);
  assert.equal(queried.permission, 'prompt');
  assert.equal(handle.requestCalls, 0);
  const requested = await adapter.requestWritePermission(handle);
  assert.equal(requested.ok, true);
  assert.equal(handle.requestCalls, 1);
});

test('requestWritePermission does not request after a denied query', async () => {
  const handle = permissionHandle({ permission: 'denied' });
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.requestWritePermission(handle);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(handle.queryCalls, 1);
  assert.equal(handle.requestCalls, 0);
});

test('unknown picker failure is a typed picker failure', async () => {
  const adapter = createOrbitDirectoryAdapter({ window: { async showDirectoryPicker() { throw new Error('boom'); } } });
  const result = await adapter.pickDirectory();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'picker-failed');
  assert.equal(result.stage, 'picker');
});

test('createChildDirectory refuses an existing child and does not call create', async () => {
  let createCalls = 0;
  const parent = {
    async *values() {},
    async getDirectoryHandle(name, options = {}) {
      if (options.create) { createCalls += 1; return { name }; }
      return { name }; // existing
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createChildDirectory(parent, 'Existing');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'exists');
  assert.equal(createCalls, 0);
});

test('createChildDirectory conservatively rejects a case-insensitive existing child', async () => {
  let exactCalls = 0; let createCalls = 0;
  const parent = {
    async *values() { yield { name: 'NEW ORBIT', kind: 'directory' }; },
    async getDirectoryHandle() { exactCalls += 1; return { name: 'NEW ORBIT' }; }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createChildDirectory(parent, 'new orbit');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'exists');
  assert.equal(exactCalls, 0);
  assert.equal(createCalls, 0);
});

test('createMapFile conservatively rejects a case-insensitive existing file', async () => {
  let exactCalls = 0; let createCalls = 0;
  const directory = {
    async *values() { yield { name: 'my map.orbit', kind: 'file' }; },
    async getFileHandle(name, options = {}) {
      if (options.create) { createCalls += 1; return { name }; }
      exactCalls += 1; return { name: 'my map.orbit' };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createMapFile(directory, 'My Map');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'exists');
  assert.equal(exactCalls, 0);
  assert.equal(createCalls, 0);
});

test('createChildDirectory creates after an absent preflight and is honest about atomicity', async () => {
  let createCalls = 0; const child = { name: 'New Orbit' };
  const parent = {
    async *values() {},
    async getDirectoryHandle(name, options = {}) {
      if (options.create) { createCalls += 1; return child; }
      throw namedError('NotFoundError');
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createChildDirectory(parent, 'New Orbit');
  assert.equal(result.ok, true);
  assert.equal(result.handle, child);
  assert.equal(result.created, 'preflight-absent');
  assert.equal(result.atomic, false);
  assert.equal(createCalls, 1);
});

test('createChildDirectory validates names before touching the parent', async () => {
  let calls = 0;
  const parent = { async getDirectoryHandle() { calls += 1; return null; } };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createChildDirectory(parent, '../bad');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'name-separator');
  assert.equal(result.stage, 'validation');
  assert.equal(calls, 0);
});

test('enumerateTopLevelMaps filters top-level .map metadata without reading bytes', async () => {
  const a = fileHandle('a.orbit', { size: 11, lastModified: 200 });
  const b = fileHandle('B.orbit', { size: 22, lastModified: 100 });
  const folder = fileHandle('folder', { kind: 'directory' });
  const text = fileHandle('note.txt');
  const dir = directoryHandle([a, b, folder, text]);
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(dir, { token: 't1' });
  assert.equal(result.ok, true);
  assert.equal(result.token, 't1');
  assert.deepEqual(result.entries.map((entry) => entry.name), ['a.orbit', 'B.orbit']);
  assert.deepEqual(result.entries.map((entry) => [entry.size, entry.lastModified]), [[11, 200], [22, 100]]);
  assert.equal(result.truncated, false);
  assert.equal(a.bytesRead + b.bytesRead, 0);
  assert.equal(a.metadataCalls, 1);
});

test('limit 1 with 10,000 matching maps stops at the first excess match and closes the iterator', async () => {
  let yielded = 0; let metadataReads = 0; let returnCalls = 0; let completed = false;
  const directory = {
    values() {
      return {
        async *[Symbol.asyncIterator]() {
          try {
            for (let i = 0; i < 10000; i += 1) {
              yielded += 1;
              yield {
                name: 'map-' + i + '.orbit',
                kind: 'file',
                async getFile() {
                  metadataReads += 1;
                  return { name: 'map-' + i + '.orbit', size: 1, lastModified: i, type: 'application/x-orbit' };
                }
              };
            }
            completed = true;
          } finally {
            if (!completed) returnCalls += 1;
          }
        }
      };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(directory, { limit: 1, nowFn: () => 0 });
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.scanned, 2);
  assert.equal(yielded, 2, 'must stop after the first excess matching entry');
  assert.equal(metadataReads, 1, 'must not read metadata for lookahead entries');
  assert.equal(returnCalls, 1, 'must close the iterator on early termination');
});

test('limit 1 on an exactly one-entry directory is complete and does not call iterator.return', async () => {
  let yielded = 0; let returnCalls = 0; let completed = false;
  const directory = {
    values() {
      return {
        async *[Symbol.asyncIterator]() {
          try {
            yielded += 1;
            yield { name: 'only.orbit', kind: 'file', async getFile() { return { name: 'only.orbit', size: 2, lastModified: 3, type: '' }; } };
            completed = true;
          } finally {
            if (!completed) returnCalls += 1;
          }
        }
      };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(directory, { limit: 1, nowFn: () => 0 });
  assert.equal(result.entries.length, 1);
  assert.equal(result.truncated, false);
  assert.equal(yielded, 1);
  assert.equal(returnCalls, 0);
});

test('mixed unrelated entries use the bounded lookahead and do not read their metadata', async () => {
  let yielded = 0; let metadataReads = 0; let returnCalls = 0; let completed = false;
  const names = ['a.orbit', 'x.txt', 'y.txt', 'z.txt', 'b.orbit'];
  const directory = {
    values() {
      return {
        async *[Symbol.asyncIterator]() {
          try {
            for (const name of names) {
              yielded += 1;
              yield {
                name,
                kind: 'file',
                async getFile() { metadataReads += 1; return { name, size: 1, lastModified: 1, type: '' }; }
              };
            }
            completed = true;
          } finally {
            if (!completed) returnCalls += 1;
          }
        }
      };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(directory, { limit: 1, lookaheadLimit: 3, nowFn: () => 0 });
  assert.equal(result.entries.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.lookaheadLimited, true);
  assert.equal(yielded, 4, 'one result plus at most the lookahead budget');
  assert.equal(metadataReads, 1);
  assert.equal(returnCalls, 1);
});

test('an incomplete case-insensitive preflight performs zero mutations', async () => {
  let exactCalls = 0; let createCalls = 0;
  const parent = {
    async *values() {
      yield { name: 'one', kind: 'directory' };
      yield { name: 'two', kind: 'directory' };
      yield { name: 'three', kind: 'directory' };
    },
    async getDirectoryHandle(name, options = {}) {
      if (options.create) createCalls += 1; else exactCalls += 1;
      return { name };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createChildDirectory(parent, 'missing', { scanLimit: 2, nowFn: () => 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'preflight-incomplete');
  assert.equal(exactCalls, 0);
  assert.equal(createCalls, 0);
});

test('a stale case-insensitive preflight performs zero mutations', async () => {
  let exactCalls = 0; let createCalls = 0;
  const parent = {
    async *values() { yield { name: 'one', kind: 'directory' }; },
    async getDirectoryHandle(name, options = {}) {
      if (options.create) createCalls += 1; else exactCalls += 1;
      return { name };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createChildDirectory(parent, 'missing', { isCurrent: () => false });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(exactCalls, 0);
  assert.equal(createCalls, 0);
});

test('an ownership loss after a complete preflight still performs zero mutations', async () => {
  let calls = 0; let exactCalls = 0; let createCalls = 0;
  const parent = {
    async *values() { yield { name: 'one', kind: 'directory' }; },
    async getDirectoryHandle(name, options = {}) {
      calls += 1;
      if (options.create) createCalls += 1; else exactCalls += 1;
      return { name };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  let checks = 0;
  const result = await adapter.createChildDirectory(parent, 'missing', { isCurrent: () => ++checks < 3 });
  // The check passes at preflight start and after its entry, then fails before mutation.
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(exactCalls + createCalls, 0);
});

test('an incomplete filename preflight performs zero mutations', async () => {
  let exactCalls = 0; let createCalls = 0;
  const directory = {
    async *values() {
      yield { name: 'one.txt', kind: 'file' };
      yield { name: 'two.txt', kind: 'file' };
      yield { name: 'three.txt', kind: 'file' };
    },
    async getFileHandle(name, options = {}) {
      if (options.create) createCalls += 1; else exactCalls += 1;
      return { name };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createMapFile(directory, 'missing', { scanLimit: 2, nowFn: () => 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'preflight-incomplete');
  assert.equal(exactCalls, 0);
  assert.equal(createCalls, 0);
});

test('enumeration caps at the entry limit and reports truncation', async () => {
  const dir = directoryHandle([
    fileHandle('a.orbit'), fileHandle('b.orbit'), fileHandle('c.orbit')
  ]);
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(dir, { limit: 2 });
  assert.equal(result.entries.length, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.scanned, 3);
});

test('an exactly full list is not falsely reported as truncated', async () => {
  const dir = directoryHandle([fileHandle('a.orbit'), fileHandle('b.orbit')]);
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(dir, { limit: 2 });
  assert.equal(result.entries.length, 2);
  assert.equal(result.truncated, false);
});

test('enumeration reports time-bound truncation', async () => {
  let clock = 0;
  const dir = directoryHandle([fileHandle('a.orbit'), fileHandle('b.orbit')]);
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(dir, { nowFn: () => { clock += 1; return clock; }, durationMs: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.equal(result.timedOut, true);
});

test('enumeration returns stale without results when ownership is lost', async () => {
  let current = true;
  const first = fileHandle('a.orbit');
  first.setAfterRead(() => { current = false; });
  const dir = directoryHandle([first, fileHandle('b.orbit')]);
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(dir, { isCurrent: () => current });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
  assert.equal(result.stale, true);
});

test('enumeration skips a file that disappears between listing and metadata', async () => {
  const gone = fileHandle('gone.orbit', { getFileError: namedError('NotFoundError') });
  const ok = fileHandle('ok.orbit');
  const dir = directoryHandle([gone, ok]);
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateTopLevelMaps(dir);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.entries.map((entry) => entry.name), ['ok.orbit']);
});

test('enumeration maps directory permission failure and generic failure', async () => {
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const denied = await adapter.enumerateTopLevelMaps(directoryHandle([], { valuesError: namedError('NotAllowedError') }));
  assert.equal(denied.reason, 'permission-denied');
  const failed = await adapter.enumerateTopLevelMaps(directoryHandle([], { valuesError: new Error('boom') }));
  assert.equal(failed.reason, 'enumerate-failed');
});

test('getFileMetadata reads metadata only', async () => {
  const file = fileHandle('a.orbit', { size: 7, lastModified: 9 });
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.getFileMetadata(file);
  assert.equal(result.ok, true);
  assert.deepEqual([result.size, result.lastModified], [7, 9]);
  assert.equal(file.bytesRead, 0);
});

test('createMapFile refuses an existing zero-byte file instead of inferring ownership', async () => {
  let createCalls = 0;
  const directory = {
    async *values() {},
    async getFileHandle(name, options = {}) {
      if (options.create) { createCalls += 1; return { name }; }
      return { name }; // existing, size irrelevant
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createMapFile(directory, 'Owned.orbit');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'exists');
  assert.equal(createCalls, 0);
});

test('createMapFile normalizes and creates only after an absent preflight', async () => {
  let createCalls = 0; const file = { name: 'My Map.orbit' };
  const directory = {
    async *values() {},
    async getFileHandle(name, options = {}) {
      if (options.create) { createCalls += 1; return file; }
      throw namedError('NotFoundError');
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createMapFile(directory, 'My Map');
  assert.equal(result.ok, true);
  assert.equal(result.name, 'My Map.orbit');
  assert.equal(result.atomic, false);
  assert.equal(createCalls, 1);
});

test('createMapFile rejects traversal before touching the directory', async () => {
  let calls = 0;
  const directory = { async getFileHandle() { calls += 1; return null; } };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.createMapFile(directory, '../escape');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'name-separator');
  assert.equal(result.stage, 'validation');
  assert.equal(calls, 0);
});

test('writeFile awaits write and close and reports close failure with abort', async () => {
  let aborted = 0; let closed = 0;
  const handle = {
    async createWritable() {
      return {
        async write() {},
        async close() { closed += 1; throw new Error('close fail'); },
        async abort() { aborted += 1; }
      };
    }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.writeFile(handle, new Blob(['x']));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write-failed');
  assert.equal(result.stage, 'close');
  assert.equal(closed, 1);
  assert.equal(aborted, 1);
});

test('writeFile success closes exactly once', async () => {
  let closes = 0; let writes = 0;
  const handle = { async createWritable() { return { async write() { writes += 1; }, async close() { closes += 1; }, async abort() {} }; } };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.writeFile(handle, new Blob(['x']));
  assert.equal(result.ok, true);
  assert.equal(writes, 1);
  assert.equal(closes, 1);
});

test('browser enumeration includes subfolders and .orbit files together and hides unrelated files', async () => {
  const folder = fileHandle('Subfolder', { kind: 'directory' });
  const map = fileHandle('한국어.orbit', { size: 33, lastModified: 500 });
  const unrelated = fileHandle('notes.txt');
  const dir = directoryHandle([folder, map, unrelated]);
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker() {} } });
  const result = await adapter.enumerateBrowserEntries(dir, { token: 'browser' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries.map((entry) => [entry.kind, entry.name]), [['folder', 'Subfolder'], ['file', '한국어.orbit']]);
  assert.equal(folder.metadataCalls, 0, 'folder handles are not read as files');
  assert.equal(map.metadataCalls, 1);
  assert.equal(unrelated.metadataCalls, 0);
  assert.equal(map.bytesRead, 0);
});

test('read picker permission uses read mode and never asks for write', async () => {
  const modes = [];
  const handle = {
    name: 'Read Only Orbit',
    async queryPermission(options) { modes.push(['query', options.mode]); return 'granted'; },
    async requestPermission(options) { modes.push(['request', options.mode]); return 'granted'; }
  };
  const adapter = createOrbitDirectoryAdapter({ window: { showDirectoryPicker: async () => handle } });
  const picked = await adapter.pickDirectory({ mode: 'read' });
  assert.equal(picked.ok, true);
  assert.equal(picked.permission, 'granted');
  assert.deepEqual(modes, [['query', 'read']]);
});
