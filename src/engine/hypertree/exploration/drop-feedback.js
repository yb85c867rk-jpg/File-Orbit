export const PROHIBITED_DROP_MESSAGE = 'This action is not allowed.';

/** Owned wording for rejected pointerup destinations. */
export function dropRejectionMessage({ reason, dataTarget = false }) {
  if (dataTarget && reason === 'data-target') return 'Drop onto a folder, not a data item.';
  if (reason === 'stale-gesture' || reason === 'stale-id') return 'The map changed. Please try dragging again.';
  return 'Drop onto a folder to move this item.';
}
/** One owned status-line timer shared by drag/drop feedback. */
export function createDropFeedback(element, { duration = 2000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!element) throw new Error('feedback element is required');
  let timer = null;
  return {
    show(message) {
      if (timer !== null) clearTimer(timer);
      element.textContent = String(message);
      timer = setTimer(() => {
        element.textContent = '';
        timer = null;
      }, duration);
    },
    clear() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      element.textContent = '';
    },
    get timer() { return timer; },
    get text() { return element.textContent; }
  };
}

