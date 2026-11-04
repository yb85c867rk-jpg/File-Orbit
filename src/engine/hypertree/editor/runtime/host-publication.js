export function assertHostConfiguration({ host = null, candidateHostFactory = null } = {}) {
  const rendered = host !== null && host !== undefined;
  const staged = typeof candidateHostFactory === 'function';
  if (rendered && !staged) throw new Error('A rendered editable LOD runtime requires candidateHostFactory for staging hosts.');
}
export function swapCandidateHost({ host, candidateHost, faults = {} }) {
  if (faults.hostReplace) return { ok: false, reason: 'install-failed', message: 'Injected host replacement failure.' };
  const oldHost = host; const oldParent = oldHost?.parentNode || null; const oldAnchor = oldParent ? oldHost.nextSibling : null;
  if (!candidateHost || !oldParent) return { ok: true, oldHost, oldParent, oldAnchor, candidateHost, replaced: false };
  try { oldParent.replaceChild(candidateHost, oldHost); return { ok: true, oldHost, oldParent, oldAnchor, candidateHost, replaced: true }; }
  catch (error) { return { ok: false, reason: 'install-failed', message: String(error?.message || error) }; }
}
export function restoreHost(swap) {
  if (!swap?.replaced || !swap.oldParent) return;
  try {
    if (swap.candidateHost?.parentNode === swap.oldParent) swap.oldParent.replaceChild(swap.oldHost, swap.candidateHost);
    else { swap.candidateHost?.remove?.(); swap.oldParent.insertBefore(swap.oldHost, swap.oldAnchor); }
  } catch {}
}

