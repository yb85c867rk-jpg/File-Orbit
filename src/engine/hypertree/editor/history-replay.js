import { buildMetadataReplayCommand, buildStructuralReplayCommand, buildDeleteReplayCommand } from './history-commands.js';
import { performEditorCommandInstallation } from './action.js';

function requiredAttachments(tree) {
  const refs = [];
  const visit = (node) => {
    if (typeof node?.data?.attachmentId === 'string') refs.push({ id: node.data.attachmentId, data: node.data });
    for (const child of node?.children || []) visit(child);
  };
  if (tree) visit(tree);
  return refs;
}
export function validateReplayAttachments(tree, registry) {
  for (const ref of requiredAttachments(tree)) {
    const record = registry?.get?.(ref.id);
    if (!record) return { ok: false, reason: 'attachment-missing', message: 'An attachment required by this history entry is no longer available.' };
    const metadata = record.metadata;
    if (metadata.attachmentId !== ref.id) return { ok: false, reason: 'attachment-mismatch', message: 'An attachment reference no longer matches the registry.' };
    if (ref.data.classification && metadata.classification && JSON.stringify(ref.data.classification) !== JSON.stringify(metadata.classification)) {
      return { ok: false, reason: 'attachment-mismatch', message: 'An attachment classification no longer matches the registry.' };
    }
  }
  return { ok: true };
}
export function performMetadataHistoryReplay({ direction, history, tree, datasetToken, commit, attachmentRegistry = null, policyContext = undefined, maxNodes = undefined, ...rest }) {
  if (!history) return { ok: false, reason: 'history-unavailable' };
  const plan = direction === 'undo' ? history.planUndo() : history.planRedo();
  if (!plan.ok) return plan;
  const build = plan.entry.kind === 'metadata-edit' ? buildMetadataReplayCommand
    : plan.entry.kind === 'structural-delete' ? buildDeleteReplayCommand
      : buildStructuralReplayCommand;
  const command = build({ tree, entry: plan.entry, direction, datasetToken, structuralRootId: rest.structuralRootId, policyContext, maxNodes });
  if (!command.ok) return command;
  if (attachmentRegistry) {
    const attachments = validateReplayAttachments(command.candidateTree, attachmentRegistry);
    if (!attachments.ok) return attachments;
  }
  const result = performEditorCommandInstallation({
    ...rest, tree, datasetToken, commit,
    command: { ...command, baseLayout: rest.baseLayout, baseRevision: rest.baseRevision ?? 0 }
  });
  if (!result.ok) return result;
  history.commitMove(plan);
  return { ...result, historyPlan: plan, entry: plan.entry };
}










