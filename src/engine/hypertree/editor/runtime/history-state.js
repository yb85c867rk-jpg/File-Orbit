export function retainedHistoryEntries(history) { return [...history.undo, ...history.redo]; }
export function sweepHistoryResources(bridge, tree, history) { return bridge.sweepAttachments({ tree, entries: retainedHistoryEntries(history) }); }
