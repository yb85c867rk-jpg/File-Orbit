/**
 * Non-mutating capability description for a future Rename Map execution.
 *
 * Method presence is captured, but it never authorizes a direct move. Direct
 * execution requires an independently verified backend and verified no-clobber
 * destination semantics. No filesystem method is invoked here.
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
  const directMoveEligible = directMovePresent && directMoveVerified && overwriteVerified;
  const directMoveBlockedReason = !directMovePresent
    ? 'method-missing'
    : !directMoveVerified
      ? 'backend-unverified'
      : !overwriteVerified
        ? 'overwrite-unverified'
        : null;
  const strategy = directMoveEligible
    ? 'direct-move'
    : copyPathAvailable
      ? 'copy-verify-remove'
      : 'unavailable';
  const requiresFurtherCapabilityVerification = Boolean(directMovePresent && !directMoveEligible);
  return Object.freeze({
    schema: 'fileorbit-rename-capability-v1',
    backend: String(backend || 'unknown'),
    directMovePresent,
    directMoveVerified,
    directMoveEligible,
    directMoveAuthorized: directMoveEligible,
    directMoveBlockedReason,
    overwriteSemantics: overwriteVerified ? 'verified-no-overwrite' : 'unverified',
    overwriteSemanticsVerified: overwriteVerified,
    copyPathAvailable,
    copyPathAuthorized: false,
    requiresFurtherCapabilityVerification,
    strategy,
    methodPresenceIsNotVerification: true,
    notes: Object.freeze([
      'No move(), createWritable(), create:true or removeEntry() call was made.',
      directMovePresent && !directMoveVerified
        ? 'A move method exists, but backend behavior remains unverified; direct execution is not authorized.'
        : null,
      directMovePresent && directMoveVerified && !overwriteVerified
        ? 'The backend move was verified, but destination overwrite semantics remain unverified; direct execution is not authorized.'
        : null,
      copyPathAvailable
        ? 'Copy/verify/remove is available as a separate strategy; it is not an atomic cross-file transaction and is not authorized by capability presence alone.'
        : null,
      'OPFS capability does not establish native Windows directory behavior.'
    ].filter(Boolean))
  });
}
