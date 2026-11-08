/**
 * Non-mutating capability description for a future Rename Map execution.
 *
 * Method presence is captured, but it is never treated as proof that a direct
 * rename is safe for the active backend. No filesystem method is invoked here.
 */
export function describeRenameCapability({
  fileHandle = null,
  parentHandle = null,
  backend = 'unknown',
  directMoveVerification = null,
  overwriteSemanticsVerification = null
} = {}) {
  const directMovePresent = typeof fileHandle?.move === 'function';
  const canCreateChild = typeof parentHandle?.getFileHandle === 'function';
  const canWrite = typeof fileHandle?.createWritable === 'function';
  const canRemove = typeof parentHandle?.removeEntry === 'function';
  const copyPathAvailable = Boolean(canCreateChild && canWrite && canRemove);
  const directMoveVerified = directMoveVerification === 'verified-backend';
  const overwriteVerified = overwriteSemanticsVerification === 'no-overwrite';
  const strategy = directMoveVerified
    ? 'direct-move'
    : directMovePresent
      ? 'direct-move-unverified'
      : copyPathAvailable
        ? 'copy-verify-remove'
        : 'unavailable';
  return Object.freeze({
    schema: 'fileorbit-rename-capability-v1',
    backend: String(backend || 'unknown'),
    directMovePresent,
    directMoveVerified,
    overwriteSemantics: overwriteVerified ? 'verified-no-overwrite' : 'unverified',
    copyPathAvailable,
    strategy,
    canAttemptExecution: strategy !== 'unavailable',
    methodPresenceIsNotVerification: true,
    notes: Object.freeze([
      'No move(), createWritable(), create:true or removeEntry() call was made.',
      directMovePresent && !directMoveVerified
        ? 'A move method exists, but destination overwrite and backend behavior remain unverified.'
        : null,
      copyPathAvailable
        ? 'Copy/verify/remove is available but is not an atomic cross-file transaction.'
        : null,
      'OPFS capability does not establish native Windows directory behavior.'
    ].filter(Boolean))
  });
}
