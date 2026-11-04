export function createHistoryUiVisibility({ element = null, status = null } = {}) {
  let visible = false;
  function apply(next) {
    visible = next === true;
    if (element) element.hidden = !visible;
    if (!visible && status) status.textContent = '';
  }
  apply(false);
  return {
    get visible() { return visible; },
    set(value) { apply(value); },
    reset() { apply(false); },
    show() { apply(true); },
    hide() { apply(false); },
    showForMutation(result, history) { if (result?.ok && !result.noop && history?.undoCount > 0) apply(true); },
    hideForFolderResult({ completionReason = null, targetId = null, focusedFolderId = null, terminal = false } = {}) {
      if (terminal) return visible;
      if (completionReason === 'completed' && targetId !== focusedFolderId) apply(false);
      return visible;
    }
  };
}


