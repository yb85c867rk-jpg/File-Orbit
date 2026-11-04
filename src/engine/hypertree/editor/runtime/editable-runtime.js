import { createSavedDocumentLodBridge } from '../../lod/saved-document-bridge.js';
import { createEditorHistory } from '../history.js';
import { buildRenameCommand, buildAddChildCommand, buildMetadataCommand, buildEditFolderCommand, buildEditDataCommand, buildDeleteCommand } from '../commands.js';
import { makeMetadataHistoryEntry, makeAddHistoryEntry, makeDeleteHistoryEntry, buildMetadataReplayCommand, buildStructuralReplayCommand, buildDeleteReplayCommand } from '../history-commands.js';
import { createEditorIdAllocator, countTreeNodes } from '../validation.js';
import { admitSavedMapRuntime } from '../../persistence/runtime.js';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from '../attachment-classification.js';

import { attachmentUsage, retainedAttachmentIds, verifyAttachments } from './attachment-state.js';
import { loadedFor } from './document-state.js';
import { viewOf, applyView } from './presentation.js';
import { assertHostConfiguration, swapCandidateHost as performHostSwap, restoreHost } from './host-publication.js';
export function createEditableLodRuntime({ loaded, datasetToken, viewport, policyContext = undefined, maxNodes = undefined, host = null, candidateHostFactory = null, faults = {}, width = 900, height = 600, clusterPageSize = 8, searchPageSize = 50 } = {}) {
  const owner = Object.freeze({});
  const pending = new Map();
  const consumed = new WeakSet();
  let current = null;
  let currentLoaded = loaded;
  const history = createEditorHistory();
  let revision = 0; let dirty = false; let disposed = false;
  const mapId = loaded?.map?.mapId;
  assertHostConfiguration({ host, candidateHostFactory });
  function assertLive() { if (disposed) throw new Error('editable LOD runtime is disposed'); }
  function makeBridge(targetLoaded, targetHost) { return createSavedDocumentLodBridge({ loaded: targetLoaded, datasetToken, viewport, policyContext, maxNodes, host: targetHost, width, height, clusterSize: 40, clusterPageSize, searchPageSize }); }
  function disposeRecord(record) { try { record.candidateBridge?.dispose(); } catch {} }
  function makeHandle(record) { const handle = Object.freeze({ get ok() { return true; }, get noop() { return record.noop === true; } }); pending.set(handle, record); return handle; }
  function reject(reason, message, record = null) { if (record) { pending.delete(record.handle); consumed.add(record.handle); disposeRecord(record); } return { ok: false, reason, message }; }
  function prepare(kind, args = {}) {
    assertLive();
    const command = commandFor(kind, args);
    if (!command.ok) return command;
    if (command.noop) { const record = { owner, noop: true, baseRevision: revision, datasetToken }; const handle = makeHandle(record); record.handle = handle; return handle; }
    let candidateLoaded; let candidateAttachments = [...(currentLoaded.attachments || [])];
    if (kind === 'add' && args.kind === 'file' && args.draftDataType === 'file') {
      const meta = args.draftAttachment; const file = args.attachmentFile;
      if (!meta || typeof meta.attachmentId !== 'string') return { ok: false, reason: 'attachment-required', message: 'A file addition requires attachment metadata.' };
      const existing = candidateAttachments.find((a) => a.attachmentId === meta.attachmentId);
      if (existing) {
        if (file) return { ok: false, reason: 'attachment-id-collision', message: 'A new payload cannot reuse an existing attachment ID; choose a distinct ID or explicitly reuse the retained payload.' };
        if (args.reuseAttachment !== true) return { ok: false, reason: 'attachment-reference-required', message: 'Reusing a retained attachment requires explicit reuseAttachment: true.' };
        if (existing.metadata.sizeBytes !== meta.sizeBytes || existing.metadata.mime !== meta.mime || existing.metadata.originalName !== meta.originalName) return { ok: false, reason: 'attachment-mismatch', message: 'Attachment metadata does not match the retained payload.' };
      } else {
        if (!file || typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function') return { ok: false, reason: 'attachment-payload-required', message: 'A new file requires its payload.' };
        if (file.size !== meta.sizeBytes) return { ok: false, reason: 'attachment-size-mismatch', message: 'Attachment payload size does not match metadata.' };
        if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'attachment-too-large', message: 'Attachment exceeds the per-file limit.' };
        const total = candidateAttachments.reduce((n, a) => n + (a.blob?.size || 0), 0) + file.size;
        if (total > MAX_ATTACHMENT_TOTAL_BYTES) return { ok: false, reason: 'attachment-total-limit', message: 'Attachments exceed the map total limit.' };
        candidateAttachments.push({ attachmentId: meta.attachmentId, blob: file, metadata: { ...meta } });
      }
    }
    candidateLoaded = loadedFor(currentLoaded, command.candidateTree, candidateAttachments);
    const attachmentCheck = verifyAttachments(candidateLoaded, command.candidateTree); if (!attachmentCheck.ok) return attachmentCheck;
    let candidateBridge = null; let candidateHost = null;
    try {
      candidateHost = candidateHostFactory ? candidateHostFactory() : null;
      if (host && !candidateHost) throw new Error('A rendered runtime requires a staging host for every publication.');
      candidateBridge = makeBridge(candidateLoaded, candidateHost);
      applyView(candidateBridge.model, command.view || viewOf(current.model), candidateLoaded.document.tree);
      if (candidateHost) candidateBridge.render();
    } catch (error) { try { candidateBridge?.dispose(); } catch {} return { ok: false, reason: 'preparation-failed', message: String(error?.message || error) }; }
    let entry;
    if (kind === 'add') entry = makeAddHistoryEntry({ action: args.kind === 'file' ? 'Add Data' : 'Add Folder', tree: current.tree, candidateTree: command.candidateTree, parentId: command.parentId, nodeId: command.nodeId, viewBefore: viewOf(current.model), viewAfter: viewOf(candidateBridge.model), datasetToken, policyContext, maxNodes });
    else if (kind === 'delete') entry = makeDeleteHistoryEntry({ action: command.actionLabel, tree: current.tree, candidateTree: command.candidateTree, targetId: command.targetId, structuralRootId: current.tree.id, datasetToken, viewBefore: viewOf(current.model), viewAfter: command.view, policyContext, maxNodes });
    else entry = makeMetadataHistoryEntry({ action: 'Edit', tree: current.tree, candidateTree: command.candidateTree, targetId: command.targetId, viewBefore: viewOf(current.model), viewAfter: viewOf(candidateBridge.model), datasetToken, policyContext, maxNodes });
    const plan = entry ? history.planAdd(entry) : null;
    if (plan && !plan.ok) { candidateBridge.dispose(); return { ok: false, ...plan }; }
    const record = { owner, command, candidateLoaded, candidateBridge, candidateHost, entry, plan, baseRevision: revision, datasetToken, mapId, noop: false };
    const handle = makeHandle(record); record.handle = handle; return handle;
  }
  function validateRecord(record) {
    if (record.owner !== owner) return { ok: false, reason: 'foreign-transaction' };
    if (record.datasetToken !== datasetToken || record.mapId !== mapId || record.baseRevision !== revision || currentLoaded.map.mapId !== mapId) return { ok: false, reason: 'stale-revision' };
    const admission = admitSavedMapRuntime({ loaded: record.candidateLoaded, datasetToken, viewport, policyContext, maxNodes });
    if (!admission || admission.nodeCount !== countTreeNodes(record.candidateLoaded.document.tree)) return { ok: false, reason: 'node-count-inconsistent' };
    const attachmentCheck = verifyAttachments(record.candidateLoaded, record.candidateLoaded.document.tree); if (!attachmentCheck.ok) return attachmentCheck;
    return { ok: true };
  }
  function swapHost(candidateHost) { return performHostSwap({ host, candidateHost, faults }); }
  function publish(record, plan, operation) {
    const old = current; const oldLoaded = currentLoaded;
    const swap = swapHost(record.candidateHost);
    if (!swap.ok) { disposeRecord(record); return swap; }
    let committed = false;
    try { committed = plan ? (faults.historyPublish ? false : history.commitAdd(plan)) : true; } catch { committed = false; }
    if (!committed) {
      restoreHost(swap); disposeRecord(record); current = old; currentLoaded = oldLoaded; host = swap.oldHost;
      return { ok: false, reason: 'history-publish-failed', message: 'History could not publish this change.' };
    }
    current = record.candidateBridge; currentLoaded = record.candidateLoaded; host = record.candidateHost || swap.oldHost;
    revision += 1; dirty = true; settleAttachments();
    let teardownError = null;
    try { old.dispose(); } catch (error) { teardownError = String(error?.message || error); }
    return { ok: true, revision, dirty, operation, teardownError };
  }
  function commit(handle) {
    if (disposed) return { ok: false, reason: 'disposed-runtime', message: 'The runtime is disposed.' };
    assertLive();
    if (!handle || typeof handle !== 'object') return { ok: false, reason: 'foreign-transaction' };
    const record = pending.get(handle);
    if (!record) return { ok: false, reason: consumed.has(handle) ? 'consumed-transaction' : 'foreign-transaction' };
    if (record.noop) { pending.delete(handle); consumed.add(handle); return { ok: true, noop: true }; }
    const valid = validateRecord(record); if (!valid.ok) return reject(valid.reason, valid.message, record);
    const result = publish(record, record.plan, record.command.operation || record.command.actionLabel);
    pending.delete(handle); consumed.add(handle);
    return result;
  }
  function replay(direction) {
    assertLive(); const plan = direction === 'undo' ? history.planUndo() : history.planRedo();
    if (!plan.ok) return plan; const entry = plan.entry;
    const builder = entry.kind === 'metadata-edit' ? buildMetadataReplayCommand : entry.kind === 'structural-delete' ? buildDeleteReplayCommand : buildStructuralReplayCommand;
    const command = builder({ tree: current.tree, entry, direction, datasetToken, structuralRootId: current.tree.id, policyContext, maxNodes });
    if (!command.ok) return command;
    const candidateLoaded = loadedFor(currentLoaded, command.candidateTree); const check = verifyAttachments(candidateLoaded, command.candidateTree); if (!check.ok) return check;
    let candidateBridge; let candidateHost = null;
    try { candidateHost = candidateHostFactory ? candidateHostFactory() : null; if (host && !candidateHost) throw new Error('A rendered runtime requires a staging host for every publication.'); candidateBridge = makeBridge(candidateLoaded, candidateHost); applyView(candidateBridge.model, command.view || viewOf(current.model), candidateLoaded.document.tree); if (candidateHost) candidateBridge.render(); }
    catch (error) { try { candidateBridge?.dispose(); } catch {} return { ok: false, reason: 'preparation-failed', message: String(error?.message || error) }; }
    const old = current; const oldLoaded = currentLoaded;
    const swap = swapHost(candidateHost);
    if (!swap.ok) { disposeRecord({ candidateBridge }); return swap; }
    let committed = false;
    try { committed = faults.historyPublish ? false : history.commitMove(plan); } catch { committed = false; }
    if (!committed) { restoreHost(swap); disposeRecord({ candidateBridge }); current = old; currentLoaded = oldLoaded; host = swap.oldHost; return { ok: false, reason: 'history-publish-failed', message: 'History could not publish this change.' }; }
    current = candidateBridge; currentLoaded = candidateLoaded; host = candidateHost || swap.oldHost; revision += 1; dirty = true; settleAttachments();
    let teardownError = null; try { old.dispose(); } catch (error) { teardownError = String(error?.message || error); }
    return { ok: true, revision, dirty, operation: command.operation, direction, teardownError };
  }
  function cancel(handle) { const record = pending.get(handle); if (!record) return false; pending.delete(handle); consumed.add(handle); if (!record.noop) disposeRecord(record); return true; }
  current = makeBridge(loaded, host); if (host) current.render();
  return {
    get bridge() { return current; }, get tree() { return current.tree; }, get model() { return current.model; }, get host() { return host; }, get loaded() { return currentLoaded; },
    get revision() { return revision; }, get dirty() { return dirty; }, get mapId() { return mapId; },
    get undoCount() { return history.undoCount; }, get redoCount() { return history.redoCount; },
    get usage() { const entries = [...history.undo, ...history.redo]; return { ...attachmentUsage(currentLoaded, current.tree, entries), pendingBytes: pendingBytes() }; },
    scene() { assertLive(); return current.scene(); }, render() { assertLive(); return current.render(); }, context() { return current.context(); }, view() { return viewOf(current.model); },
    search(q, p = 1) { assertLive(); return current.search(q, p); }, select(id) { assertLive(); return current.select(id); }, details() { assertLive(); return current.details(); }, preview(id) { assertLive(); return current.preview(id); },
    openFolder(id) { current.openFolder(id); return current.scene(); }, expandCluster(id) { current.expandCluster(id); return current.scene(); }, back() { current.back(); return current.scene(); }, pageNext() { current.pageNext(); return current.scene(); }, pagePrev() { current.pagePrev(); return current.scene(); },
    prepare, commit, cancel, undo() { return replay('undo'); }, redo() { return replay('redo'); },
    dispose() { if (disposed) return; disposed = true; for (const record of pending.values()) if (!record.noop) disposeRecord(record); pending.clear(); try { current.dispose(); } catch {} history.clear(); }
  };
  function settleAttachments() {
    const entries = [...history.undo, ...history.redo];
    const swept = current.sweepAttachments({ tree: current.tree, entries });
    const ids = retainedAttachmentIds(current.tree, entries);
    const attachments = (currentLoaded.attachments || []).filter((a) => ids.has(a.attachmentId));
    currentLoaded = { ...currentLoaded, attachments, map: { ...currentLoaded.map, attachmentBytes: attachments.reduce((sum, a) => sum + (a.blob?.size || 0), 0) } };
    return swept;
  }
  function pendingBytes() { let total = 0; for (const record of pending.values()) if (!record.noop) total += (record.candidateLoaded.attachments || []).reduce((sum, a) => sum + (a.blob?.size || 0), 0); return total; }
  function commandFor(kind, args) {
    const base = { tree: current.tree, datasetToken, baseRevision: revision, expectedDatasetToken: datasetToken, expectedRevision: revision, policyContext, maxNodes };
    if (kind === 'rename') return buildRenameCommand({ ...base, targetId: args.targetId, draftName: args.draftName });
    if (kind === 'metadata') return buildMetadataCommand({ ...base, targetId: args.targetId, description: args.description, link: args.link, linkProvided: args.linkProvided });
    if (kind === 'edit-folder') return buildEditFolderCommand({ ...base, targetId: args.targetId, draftName: args.draftName, draftDescription: args.draftDescription });
    if (kind === 'edit-data') return buildEditDataCommand({ ...base, targetId: args.targetId, draftName: args.draftName, description: args.description, link: args.link, linkProvided: args.linkProvided });
    if (kind === 'add') return buildAddChildCommand({ ...base, parentId: args.parentId, kind: args.kind, draftName: args.draftName, draftDescription: args.draftDescription ?? null, draftLink: args.draftLink ?? null, draftDataType: args.draftDataType ?? null, draftAttachment: args.draftAttachment ?? null, parentDepth: args.parentDepth, allocator: createEditorIdAllocator({ datasetToken }) });
    if (kind === 'delete') return buildDeleteCommand({ ...base, targetId: args.targetId, structuralRootId: current.tree.id, datasetTokenExpected: datasetToken, viewBefore: viewOf(current.model) });
    throw new Error('unsupported command ' + kind);
  }
}










