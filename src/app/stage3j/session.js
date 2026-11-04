import { createRestoredAttachmentRegistry, buildSaveSnapshot } from '../../engine/hypertree/persistence/index.js';
import { createAttachmentRegistry } from '../../engine/hypertree/editor/attachments.js';
import { decodeBackup, encodeBackup, safeBackupFilename } from '../../engine/hypertree/persistence/backup.js';
import { createEditableLodRuntime } from '../../engine/hypertree/editor/runtime/index.js';

export function createStage3JSession({ repository, policyContext, datasetToken, viewport, runtimeOptions = {} } = {}) {
  let current = null; let mapName = 'FileOrbit map'; let disposed = false; let requested = 0; let documentCounter = 0;
  let liveHost = runtimeOptions.host ?? null; const hostFactory = runtimeOptions.candidateHostFactory ?? null;
  function assertLive() { if (disposed) throw new Error('Stage 3J session is disposed'); }
  function sameDocument(doc) { return !disposed && current === doc && current?.docToken === doc.docToken && current?.runtime === doc.runtime; }
  function makeDocument({ runtime, loaded, mapId = loaded.map.mapId, generation = loaded.map.generation, name = mapName }) {
    return { docToken: ++documentCounter, runtime, loaded, mapName: name, mapId, generation, savedRevision: runtime.revision, saveInFlight: null, baseline: { mapId, generation } };
  }
  function installDocument({ loaded, name = mapName, mapId = loaded.map.mapId, generation = loaded.map.generation, request = null }) {
    if (disposed) return { ok: false, reason: 'disposed-session' };
    if (request !== null && request !== requested) return { ok: false, reason: 'stale-operation' };
    const old = current; const oldHost = old?.runtime?.host ?? liveHost; const stagingHost = hostFactory ? hostFactory() : null;
    let runtime;
    try { runtime = createEditableLodRuntime({ ...runtimeOptions, host: stagingHost, candidateHostFactory: hostFactory, loaded, datasetToken, viewport, policyContext }); }
    catch (error) { try { stagingHost?.remove?.(); } catch {} return { ok: false, reason: 'runtime-failed', message: String(error?.message || error) }; }
    try {
      if (stagingHost && oldHost?.parentNode) oldHost.parentNode.replaceChild(stagingHost, oldHost);
      else if (stagingHost && !oldHost) { /* detached first publication */ }
      if (runtime.tree.id !== loaded.document.tree.id) throw new Error('Document identity changed during runtime construction.');
    } catch (error) { try { runtime.dispose(); } catch {} try { stagingHost?.remove?.(); } catch {} return { ok: false, reason: 'install-failed', message: String(error?.message || error) }; }
    const next = makeDocument({ runtime, loaded, mapId, generation, name }); current = next; liveHost = runtime.host; mapName = name;
    try { old?.runtime?.dispose?.(); } catch {}
    return { ok: true, mapId: next.mapId, generation: next.generation, name };
  }
  async function openBackup(blob, { name = 'FileOrbit map', isCancelled = () => false } = {}) {
    if (disposed) return { ok: false, reason: 'disposed-session' };
    if (isCancelled()) return { ok: false, reason: 'cancelled' };
    const request = ++requested; let decoded; let restored; let saved; let loaded;
    try {
      decoded = await decodeBackup(blob, { policyContext, isCancelled });
      if (isCancelled()) return { ok: false, reason: 'cancelled' }; if (request !== requested) return { ok: false, reason: 'stale-operation' };
      restored = createAttachmentRegistry({ datasetToken });
      for (const attachment of decoded.attachments) restored.adopt({ attachmentId: attachment.attachmentId, file: attachment.blob, metadata: { ...attachment.metadata, attachmentId: attachment.attachmentId } });
      const snapshot = buildSaveSnapshot({ tree: decoded.tree, registry: restored, datasetToken, capturedRevision: 0, policyContext });
      saved = await repository.save(snapshot);
      if (isCancelled()) return { ok: false, reason: 'cancelled' }; if (request !== requested) return { ok: false, reason: 'stale-operation' };
      loaded = await repository.load(saved.mapId);
      if (isCancelled()) return { ok: false, reason: 'cancelled' }; if (request !== requested) return { ok: false, reason: 'stale-operation' };
    } catch (error) { restored?.clear?.(); return { ok: false, reason: error?.code || 'open-failed', message: String(error?.message || error) }; }
    if (disposed || request !== requested) return { ok: false, reason: disposed ? 'disposed-session' : 'stale-operation' };
    return installDocument({ loaded, name, mapId: saved.mapId, generation: loaded.map.generation, request });
  }
  async function saveAs({ name = mapName, isCancelled = () => false } = {}) {
    assertLive(); const doc = current; if (!doc) return { ok: false, reason: 'no-document' };
    const runtime = doc.runtime; const revision = runtime.revision;
    try {
      const restored = createRestoredAttachmentRegistry({ attachments: runtime.loaded.attachments, datasetToken });
      const pack = await encodeBackup({ tree: runtime.tree, registry: restored.registry, mapName: name, sourceMapId: doc.mapId, policyContext, isCancelled });
      if (isCancelled()) return { ok: false, reason: 'backup-cancelled' };
      if (!sameDocument(doc) || runtime.revision !== revision) return { ok: false, reason: 'stale-operation' };
      return { ok: true, blob: pack.blob, fileName: safeBackupFilename(name), mapId: doc.mapId, revision };
    } catch (error) { return { ok: false, reason: error?.code || 'save-as-failed', message: String(error?.message || error) }; }
  }
  async function save() {
    assertLive(); const doc = current; if (!doc) return { ok: false, reason: 'no-document' };
    if (doc.saveInFlight) {
      if (doc.saveInFlight.revision === doc.runtime.revision) return doc.saveInFlight.promise;
      try { await doc.saveInFlight.promise; } catch {}
      if (!sameDocument(doc)) return { ok: false, reason: 'stale-operation' };
      return save();
    }
    const runtime = doc.runtime; const revision = runtime.revision; const generation = doc.generation; const mapId = doc.mapId;
    const promise = (async () => {
      try {
        const restored = createRestoredAttachmentRegistry({ attachments: runtime.loaded.attachments, datasetToken });
        const snapshot = buildSaveSnapshot({ tree: runtime.tree, registry: restored.registry, datasetToken, capturedRevision: revision, mapId, expectedGeneration: generation, policyContext });
        const saved = await repository.save(snapshot);
        if (!sameDocument(doc)) return { ok: false, reason: 'stale-operation' };
        doc.generation = saved.generation ?? generation + 1; doc.baseline = { mapId, generation: doc.generation }; doc.savedRevision = revision;
        return { ok: true, generation: doc.generation, revision, currentRevision: runtime.revision, dirty: runtime.revision !== revision };
      } catch (error) { return { ok: false, reason: error?.code === 'stale-generation' ? 'stale-generation' : (error?.code || 'save-failed'), message: String(error?.message || error) }; }
    })();
    doc.saveInFlight = { revision, promise };
    try { return await promise; } finally { if (doc.saveInFlight?.promise === promise) doc.saveInFlight = null; }
  }
  function close(reason = 'closed') { if (disposed) return; disposed = true; requested += 1; current?.runtime?.dispose?.(); current = null; return reason; }
  function switchDocument(loaded) { if (disposed) return { ok: false, reason: 'disposed-session' }; requested += 1; const request = requested; const result = installDocument({ loaded, name: loaded.map.name || mapName, request }); return result.ok ? current : result; }
  return {
    get current() { return current; }, get mapName() { return mapName; }, get disposed() { return disposed; }, get host() { return liveHost; },
    get isDirty() { return Boolean(current && current.runtime.revision !== current.savedRevision); },
    openBackup, saveAs, save, close, switchDocument
  };
}

