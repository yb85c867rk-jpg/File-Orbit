export const EMPTY_RUNTIME_FAULTS = Object.freeze({ historyPublish: false, hostReplace: false });
export function createRuntimeFaultSeams(initial = {}) { return { historyPublish: false, hostReplace: false, ...initial }; }
