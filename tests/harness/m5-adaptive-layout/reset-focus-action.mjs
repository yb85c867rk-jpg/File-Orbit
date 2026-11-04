/**
 * Shared Reset-focus action ordering:
 * focus fields are cleared only after the fitted frame installation succeeds and
 * before the frame's status is published.
 */
export function executeResetFocus({ prepare, fit, getFocusState, setFocusState }) {
  const before = { ...getFocusState() };
  let prepared;
  try {
    prepared = prepare();
  } catch {
    return { ok: false, prepared: null, before };
  }
  const ok = fit(prepared, () => {
    setFocusState({ requestedFocusId: null, displayedFocusId: null, framingMode: 'fit' });
  });
  if (!ok) {
    setFocusState({ requestedFocusId: before.requestedFocusId, displayedFocusId: before.displayedFocusId });
  }
  return { ok, prepared, before };
}
