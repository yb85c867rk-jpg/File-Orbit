import { chooseEditorAction } from './activation-flow.js';

/** Harness-consumed menu→form adapter; authoritative identity is always supplied. */
export function createEditorMenuAdapter({ getIdentity, getDependencies = () => ({}), choose = chooseEditorAction }) {
  if (typeof getIdentity !== 'function') throw new Error('getIdentity is required');
  return (target, action) => {
    const identity = getIdentity() || {};
    return choose({
      ...getDependencies(),
      action,
      target,
      datasetToken: identity.datasetToken,
      baseRevision: identity.baseRevision
    });
  };
}
