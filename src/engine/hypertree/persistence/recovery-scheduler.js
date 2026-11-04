import { createRecoveryWorkspaceId, createRecoveryWorkspaceToken, createAttachmentId } from './ids.js';
import { buildRecoverySnapshot } from './recovery-codec.js';

function collectAttachmentIds(tree, output = new Set()) {
  if (typeof tree?.data?.attachmentId === 'string') output.add(tree.data.attachmentId);
  for (const child of tree?.children || []) collectAttachmentIds(child, output);
  return output;
}

/**
 * Production recovery checkpoint scheduler. It owns exactly one editing
 * workspace at a time, serializes checkpoint preparation/writes, and
 * coalesces pending work to the latest authoritative state.
 */
export function createRecoveryScheduler({
  repository,
  getSource,
  debounceMs = 600,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (handle) => clearTimeout(handle),
  allocateAttachmentId = createAttachmentId,
  onDiagnostic = () => {}
} = {}) {
  if (!repository || typeof repository.createRecoveryWorkspace !== 'function') throw new Error('A recovery repository is required.');
  if (typeof getSource !== 'function') throw new Error('getSource is required.');
  let owner = null;
  let pending = null;
  let timer = null;
  let running = null;
  let savePending = false;
  let savePendingOwner = null;
  let lifecycleToken = 0;
  let prepareGate = null;
  let retireGate = null;
  const diagnostics = { workspaceId: null, lastError: null, lastCheckpoint: null, lastRetirement: null, lastAbandon: null, writesStarted: 0, writesCompleted: 0, maxConcurrentWrites: 0, activeWrites: 0 };

  function report(code, message, detail = null) {
    diagnostics.lastError = { code, message, at: new Date().toISOString(), detail };
    try { onDiagnostic(diagnostics.lastError); } catch {}
  }
  function activeOwner(candidate = owner) {
    return Boolean(candidate && candidate.active);
  }
  function releasePendingRetention(request) {
    if (!request?.retained) return;
    for (const entry of request.retained) {
      try { entry.registry.releaseRetention(entry.lease); } catch {}
    }
  }
  function clearTimer() {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }
  function sourceMatches(source, expected) {
    return Boolean(source && expected
      && source.session === expected.session
      && source.dataset === expected.dataset
      && typeof source.tree === 'object'
      && source.registry);
  }
  function capture() {
    if (!activeOwner()) return null;
    const source = getSource();
    if (!sourceMatches(source, owner)) return null;
    const retained = [];
    for (const id of collectAttachmentIds(source.tree)) {
      const lease = source.registry.retain(id);
      if (!lease) {
        for (const entry of retained) entry.registry.releaseRetention(entry.lease);
        report('recovery-attachment-missing', 'A checkpoint attachment is no longer available.');
        return null;
      }
      retained.push({ registry: source.registry, lease });
    }
    return {
      owner,
      session: owner.session,
      dataset: owner.dataset,
      revision: source.revision,
      dirty: Boolean(source.dirty),
      tree: source.tree,
      registry: source.registry,
      expectedControlVersion: owner.controlVersion,
      retained,
      createdAt: Date.now()
    };
  }
  function enqueue(request, { immediate = false } = {}) {
    if (!request) return false;
    if (pending) releasePendingRetention(pending);
    pending = request;
    clearTimer();
    if (immediate) {
      void startProcessing();
    } else {
      timer = setTimeoutFn(() => {
        timer = null;
        void startProcessing();
      }, Math.max(0, Number(debounceMs) || 0));
    }
    return true;
  }
  function schedule({ immediate = false } = {}) {
    if (!activeOwner()) return false;
    return enqueue(capture(), { immediate });
  }
  async function processQueue() {
    while (pending) {
      const request = pending;
      pending = null;
      clearTimer();
      const currentOwner = request.owner;
      if (!activeOwner(currentOwner)) {
        releasePendingRetention(request);
        continue;
      }
      let writeActive = false;
      try {
        const source = getSource();
        if (!sourceMatches(source, request) || request.expectedControlVersion !== currentOwner.controlVersion) {
          continue;
        }
        if (prepareGate) { const gate = prepareGate; prepareGate = null; await gate(); }
        const snapshot = await buildRecoverySnapshot({
          tree: request.tree,
          registry: request.registry,
          datasetToken: request.dataset,
          capturedRevision: request.revision,
          workspaceId: currentOwner.workspaceId,
          allocateAttachmentId,
          isCancelled: () => !activeOwner(currentOwner)
        });
        if (!activeOwner(currentOwner)) continue;
        diagnostics.writesStarted += 1; diagnostics.activeWrites += 1; diagnostics.maxConcurrentWrites = Math.max(diagnostics.maxConcurrentWrites, diagnostics.activeWrites);
        let result; writeActive = true;
        result = await repository.saveRecoveryCheckpoint({
          workspaceId: currentOwner.workspaceId,
          workspaceToken: currentOwner.workspaceToken,
          expectedControlVersion: request.expectedControlVersion,
          documentName: source.documentName || null,
          origin: source.origin || 'edit',
          sourceMapId: source.sourceMapId || null,
          snapshot
        });
        writeActive = false; diagnostics.activeWrites -= 1; diagnostics.writesCompleted += 1;
        if (!activeOwner(currentOwner)) continue;
        currentOwner.controlVersion = result.workspace.controlVersion;
        if (pending && pending.owner === currentOwner) pending.expectedControlVersion = currentOwner.controlVersion;
        diagnostics.lastCheckpoint = { generation: result.generation, capturedRevision: result.checkpoint.capturedRevision, at: new Date().toISOString() };
      } catch (error) {
        if (error?.code === 'recovery-stale-owner') {
          if (!isSavePendingFor(currentOwner) && activeOwner(currentOwner)) {
            const control = await currentControl(currentOwner);
            if (control && control.controlVersion !== currentOwner.controlVersion) currentOwner.controlVersion = control.controlVersion;
            const latest = activeOwner(currentOwner) ? getSource() : null;
            if (control && latest && sourceMatches(latest, currentOwner) && latest.dirty && !pending) {
              const requestAgain = capture();
              if (requestAgain) {
                pending = requestAgain;
                continue;
              }
            }
          }
        } else if (error?.code !== 'recovery-cancelled' && activeOwner(currentOwner)) {
          report(error?.code || 'recovery-checkpoint-failed', String(error?.message || error));
        }
      }
      finally {
        if (writeActive) { diagnostics.activeWrites -= 1; writeActive = false; }
        releasePendingRetention(request);
      }
    }
  }
  function startProcessing() {
    if (running) return running;
    running = processQueue()
      .catch((error) => { report(error?.code || 'recovery-scheduler-failed', String(error?.message || error)); })
      .finally(() => { running = null; });
    return running;
  }
  async function flush() {
    while (pending || running || timer !== null) {
      if (timer !== null) {
        clearTimer();
        void startProcessing();
      }
      if (running) await running;
      else if (pending) await startProcessing();
      else if (timer !== null) clearTimer();
    }
  }
  async function beginWorkspace({ session, dataset, documentName = null, origin = 'edit', sourceMapId = null } = {}) {
    invalidate();
    const lifecycle = lifecycleToken;
    const workspaceId = createRecoveryWorkspaceId();
    const workspaceToken = createRecoveryWorkspaceToken();
    try {
      const created = await repository.createRecoveryWorkspace({ workspaceId, workspaceToken, documentName, origin, sourceMapId });
      if (lifecycle !== lifecycleToken) return null;
      const createdSource = getSource();
      if (lifecycle !== lifecycleToken) return null;
      if (!createdSource || createdSource.session !== session || createdSource.dataset !== dataset) return null;
      owner = {
        workspaceId, workspaceToken,
        controlVersion: created.workspace.controlVersion,
        session, dataset, active: true,
        documentName: documentName || null, origin, sourceMapId: sourceMapId || null
      };
      diagnostics.workspaceId = workspaceId;
      diagnostics.lastError = null;
      return owner;
    } catch (error) {
      if (lifecycle === lifecycleToken) report(error?.code || 'recovery-workspace-create-failed', 'Recovery workspace could not be created.', String(error?.message || error));
      return null;
    }
  }
  function invalidate() {
    lifecycleToken += 1;
    clearTimer();
    if (pending) releasePendingRetention(pending);
    pending = null;
    if (owner) owner.active = false;
    owner = null;
    savePending = false;
    savePendingOwner = null;
    diagnostics.workspaceId = null;
  }
  function isCurrentOwner(captured, lifecycle) {
    return Boolean(captured && captured === owner && captured.active && lifecycle === lifecycleToken);
  }
  async function adoptWorkspace({ workspaceId, workspaceToken, session, dataset, authorized = null } = {}) {
    const previousOwner = owner;
    const lifecycle = lifecycleToken;
    const source = getSource();
    if (!source || source.session !== session || source.dataset !== dataset) return null;
    if (typeof authorized === 'function' && !authorized()) return null;
    try {
      const control = await repository.loadRecoveryWorkspace(workspaceId);
      if (lifecycle !== lifecycleToken || owner !== previousOwner) return null;
      const currentSource = getSource();
      if (!currentSource || currentSource.session !== session || currentSource.dataset !== dataset) return null;
      if (typeof authorized === 'function' && !authorized()) return null;
      if (!control || control.state !== 'active' || control.workspaceToken !== workspaceToken) return null;
      invalidate();
      owner = {
        workspaceId, workspaceToken, controlVersion: control.controlVersion,
        session, dataset, active: true,
        documentName: control.documentName || null, origin: 'recovery', sourceMapId: control.sourceMapId || null
      };
      diagnostics.workspaceId = workspaceId;
      diagnostics.lastError = null;
      return owner;
    } catch (error) {
      if (lifecycle === lifecycleToken && owner === previousOwner) report(error?.code || 'recovery-workspace-adopt-failed', 'Recovered workspace could not be adopted.', String(error?.message || error));
      return null;
    }
  }
  async function checkpointNow() {
    const captured = owner; const lifecycle = lifecycleToken;
    if (!activeOwner(captured)) return false;
    const before = diagnostics.lastCheckpoint?.generation ?? null;
    if (!enqueue(capture(), { immediate: true })) return false;
    await flush();
    if (!isCurrentOwner(captured, lifecycle)) return false;
    return (diagnostics.lastCheckpoint?.generation ?? null) !== before;
  }
  async function ensureOwnerForSave(session, dataset) {
    if (activeOwner() && owner.session === session && owner.dataset === dataset) return owner;
    const source = getSource();
    if (!source) return null;
    return beginWorkspace({ session, dataset, documentName: source.documentName || null, origin: source.origin || 'edit', sourceMapId: source.sourceMapId || null });
  }
  function isSavePendingFor(captured) { return Boolean(savePending && savePendingOwner === captured); }
  async function currentControl(capturedOwner = owner) {
    const lifecycle = lifecycleToken;
    if (!activeOwner(capturedOwner)) return null;
    try {
      const record = await repository.loadRecoveryWorkspace(capturedOwner.workspaceId);
      if (!isCurrentOwner(capturedOwner, lifecycle) || !record || record.state !== 'active' || record.workspaceToken !== capturedOwner.workspaceToken) return null;
      return record;
    } catch (error) {
      if (isCurrentOwner(capturedOwner, lifecycle)) report('recovery-control-read-failed', 'Could not read the recovery workspace control.', String(error?.message || error));
      return null;
    }
  }
  function reconcileLaterState(capturedOwner, lifecycle, reservation, { failed = false } = {}) {
    if (!isCurrentOwner(capturedOwner, lifecycle)) return;
    const source = getSource();
    if (!sourceMatches(source, capturedOwner)) return;
    const shouldRecover = failed ? Boolean(source.dirty) : Boolean(source.dirty && source.revision > reservation.revision);
    if (!shouldRecover) return;
    const fresh = capture();
    if (fresh) enqueue(fresh, { immediate: true });
  }
  async function abandonReservation(reservation) {
    try { await repository.abandonRecoverySave({ workspaceId: reservation.workspaceId, workspaceToken: reservation.workspaceToken, saveId: reservation.saveId }); return true; }
    catch { return false; }
  }
  async function beginDocumentSave({ session, dataset, operation = null, revision = null } = {}) {
    const current = await ensureOwnerForSave(session, dataset);
    if (!activeOwner(current)) return null;
    const lifecycle = lifecycleToken;
    savePending = true; savePendingOwner = current;
    try {
      const reservation = await repository.beginRecoverySave({ workspaceId: current.workspaceId, workspaceToken: current.workspaceToken });
      if (!isCurrentOwner(current, lifecycle)) {
        await abandonReservation({ ...reservation, workspaceId: current.workspaceId, workspaceToken: current.workspaceToken });
        return null;
      }
      current.controlVersion = reservation.controlVersion;
      return { ...reservation, operation, revision, session, dataset, workspaceId: current.workspaceId, workspaceToken: current.workspaceToken };
    } catch (error) {
      if (isCurrentOwner(current, lifecycle)) {
        savePending = false; savePendingOwner = null;
        report(error?.code || 'recovery-save-reservation-failed', 'Recovery save reservation could not be created.', String(error?.message || error));
      }
      return null;
    }
  }
  async function retireDocumentSave(reservation) {
    if (!reservation) return false;
    const capturedOwner = owner; const lifecycle = lifecycleToken;
    const current = Boolean(capturedOwner && capturedOwner.active && capturedOwner.workspaceId === reservation.workspaceId && capturedOwner.workspaceToken === reservation.workspaceToken);
    try {
      if (retireGate) { const gate = retireGate; retireGate = null; await gate(); }
      const retired = await repository.retireRecoveryThrough({ workspaceId: reservation.workspaceId, workspaceToken: reservation.workspaceToken, saveId: reservation.saveId, saveSequence: reservation.saveSequence });
      if (!current || !isCurrentOwner(capturedOwner, lifecycle)) return false;
      capturedOwner.controlVersion = retired.workspace.controlVersion;
      if (savePendingOwner === capturedOwner) { savePending = false; savePendingOwner = null; }
      diagnostics.lastRetirement = { saveId: reservation.saveId, sequence: reservation.saveSequence, at: new Date().toISOString(), ok: true };
      reconcileLaterState(capturedOwner, lifecycle, reservation);
      return true;
    } catch (error) {
      if (current && isCurrentOwner(capturedOwner, lifecycle)) {
        diagnostics.lastRetirement = { saveId: reservation.saveId, sequence: reservation.saveSequence, at: new Date().toISOString(), ok: false, code: error?.code || 'recovery-retire-failed', message: String(error?.message || error) };
        report(error?.code || 'recovery-retire-failed', 'Recovery cleanup failed after the document Save.', String(error?.message || error));
        if (savePendingOwner === capturedOwner) { savePending = false; savePendingOwner = null; }
        await abandonReservation(reservation);
        const control = await repository.loadRecoveryWorkspace(reservation.workspaceId).catch(() => null);
        if (isCurrentOwner(capturedOwner, lifecycle) && control && control.workspaceToken === reservation.workspaceToken) {
          capturedOwner.controlVersion = control.controlVersion;
          reconcileLaterState(capturedOwner, lifecycle, reservation);
        }
      } else {
        await abandonReservation(reservation);
      }
      return false;
    }
  }
  async function abandonDocumentSave(reservation) {
    if (!reservation) return false;
    const capturedOwner = owner; const lifecycle = lifecycleToken;
    const current = Boolean(capturedOwner && capturedOwner.active && capturedOwner.workspaceId === reservation.workspaceId && capturedOwner.workspaceToken === reservation.workspaceToken);
    try {
      await repository.abandonRecoverySave({ workspaceId: reservation.workspaceId, workspaceToken: reservation.workspaceToken, saveId: reservation.saveId });
      if (!current || !isCurrentOwner(capturedOwner, lifecycle)) return true;
      if (savePendingOwner === capturedOwner) { savePending = false; savePendingOwner = null; }
      const control = await repository.loadRecoveryWorkspace(reservation.workspaceId).catch(() => null);
      if (isCurrentOwner(capturedOwner, lifecycle) && control && control.workspaceToken === reservation.workspaceToken) {
        capturedOwner.controlVersion = control.controlVersion;
        diagnostics.lastAbandon = { saveId: reservation.saveId, at: new Date().toISOString(), ok: true };
        reconcileLaterState(capturedOwner, lifecycle, reservation, { failed: true });
      }
      return true;
    } catch (error) {
      if (current && isCurrentOwner(capturedOwner, lifecycle)) {
        diagnostics.lastAbandon = { saveId: reservation.saveId, at: new Date().toISOString(), ok: false, code: error?.code || 'recovery-abandon-failed' };
        report(error?.code || 'recovery-abandon-failed', 'Recovery save reservation could not be abandoned.', String(error?.message || error));
      }
      return false;
    }
  }
  function deferNextRetirement(gate) { retireGate = typeof gate === 'function' ? gate : null; }
  function deferNextPreparation(gate) { prepareGate = typeof gate === 'function' ? gate : null; }
  function setDebounce(value) { debounceMs = Math.max(0, Number(value) || 0); }
  return {
    beginWorkspace, adoptWorkspace,
    invalidate,
    schedule,
    checkpointNow,
    flush,
    beginDocumentSave,
    retireDocumentSave,
    abandonDocumentSave, deferNextPreparation, deferNextRetirement, setDebounce,
    get workspace() { return owner; },
    get diagnostics() { return diagnostics; },
    get pending() { return Boolean(pending || running || timer !== null); }
  };
}




