import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
function run(env) {
  return spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 120000, env: { ...process.env, ...env } });
}
test('actual main Save/Open/library/delete wiring works through synthetic IndexedDB', () => {
  const result = run({ P1B: '1' });
  assert.equal(result.status, 0);
});
test('Open from empty startup reports unavailable IndexedDB honestly', () => {
  const result = run({ P1B_UNAVAILABLE: '1' });
  assert.equal(result.status, 0);
});
test('Open draw failure preserves the previous authoritative map', () => {
  const result = run({ P1B: '1', P1B_OPEN_FAIL_DRAW: '1' });
  assert.equal(result.status, 0);
});
test('Save-and-continue Open keeps replacement ownership through delayed loading', () => {
  const result = run({ P1B: '1', P1B_OWNERSHIP: '1' });
  assert.equal(result.status, 0);
});
for (const stage of ['load', 'label', 'hit']) {
  test(`Open ${stage} failure preserves the old map and releases ownership`, () => {
    const result = run({ P1B: '1', P1B_OPEN_FAIL_STAGE: stage });
    assert.equal(result.status, 0);
  });
}
test('dirty editor Continue editing preserves the draft and Discard resumes Open once', () => {
  const result = run({ P1B: '1', P1B_EDITOR_OPEN: '1' });
  assert.equal(result.status, 0);
});
test('ordinary Open holds replacement ownership during delayed loading', () => {
  const result = run({ P1B: '1', P1B_OWNER_PLAIN: '1' });
  assert.equal(result.status, 0);
});
test('failed Open recovery leaves interaction inert and preserves the original error', () => {
  const result = run({ P1B: '1', P1B_OPEN_FAIL_RECOVERY: '1' });
  assert.equal(result.status, 0);
});
test('empty-startup Open failure returns to a coherent empty state', () => {
  const result = run({ P1B: '1', P1B_EMPTY_OPEN_FAIL: '1' });
  assert.equal(result.status, 0);
});
test('clean editor form Open closes coherently and opens the library', () => {
  const result = run({ P1B: '1', P1B_EDITOR_CLEAN: '1' });
  assert.equal(result.status, 0);
});
test('narrow Map menu Open works and routes dirty editor prompts', () => {
  const result = run({ P1B: '1', P1B_NARROW: '1' });
  assert.equal(result.status, 0);
});
test('Add Data PDF after Open uses the active registry and viewer path', () => {
  const result = run({ P1B: '1', P1B_ADD_DATA: '1' });
  assert.equal(result.status, 0);
});
test('failed Add Data save retains draft/reservation, clears Saving, and retries without double count', () => {
  const result = run({ P1B: '1', P1B_ADD_DATA: '1', P1B_ADD_FAIL_RETRY: '1' });
  assert.equal(result.status, 0);
});
test('Add Data cancel and type switch release the originating pending reservation', () => {
  const result = run({ P1B: '1', P1B_ADD_DATA: '1', P1B_ADD_CANCEL: '1' });
  assert.equal(result.status, 0);
});
test('Add Data PDF after Create Map uses the active registry', () => {
  const result = run({ P1B: '1', P1B_ADD_AFTER_CREATE: '1' });
  assert.equal(result.status, 0);
});
test('repeated Open replacements own exactly one Delete confirmation', () => {
  const result = run({ P1B: '1', P1B_DELETE_OWNERSHIP: '1' });
  assert.equal(result.status, 0);
});
test('stale Save offers Cancel, Save as new copy, and confirmed Reload', () => {
  const result = run({ P1B: '1', P1B_CONFLICT: '1' });
  assert.equal(result.status, 0);
});
test('saved-map library shows application usage, origin estimate, and persist grant', () => {
  const result = run({ P1B: '1', P1B_USAGE: '1' });
  assert.equal(result.status, 0);
});
test('saved-map library shows unknown/ unavailable storage states', () => {
  const result = run({ P1B: '1', P1B_USAGE_UNKNOWN: '1' });
  assert.equal(result.status, 0);
});
test('beforeunload warning is registered for committed unsaved changes', () => {
  const result = run({ P1B: '1', P1B_UNLOAD: '1' });
  assert.equal(result.status, 0);
});
test('overlapping desktop/narrow Save is blocked and later edits stay dirty', () => {
  const result = run({ P1B: '1', P1B_DUP_SAVE: '1' });
  assert.equal(result.status, 0);
});
test('blocked open clears on success and cancel/late-success does not publish', () => {
  const result = run({ P1B: '1', P1B_BLOCKED: '1' });
  assert.equal(result.status, 0);
});
test('desktop and narrow toolbar Save submit open editor forms and persist', () => {
  const result = run({ P1B: '1', P1B_EDITOR_SYNC: '1' });
  assert.equal(result.status, 0);
});
test('applied Add PDF persists after Close with attachment and viewer intact', () => {
  const result = run({ P1B: '1', P1B_CLOSE_ATTACH: '1' });
  assert.equal(result.status, 0);
});
test('deferred Retry blocks Close, survives old failure, and commits without replay', () => {
  const result = run({ P1B: '1', P1B_RETRY_DEFER: '1' });
  assert.equal(result.status, 0);
});
test('backup export/import installs a saveable map with fresh durable identity', () => {
  const result = run({ P1B: '1', P1B_BACKUP: '1' });
  assert.equal(result.status, 0);
});
test('production Download and Upload file-input handlers round-trip through install', () => {
  const result = run({ P1B: '1', P1B_BACKUP_EVENT: '1' });
  assert.equal(result.status, 0);
});
test('production Download cancel and session replacement preserve newer ownership', () => {
  const result = run({ P1B: '1', P1B_BACKUP_OWNER: '1' });
  assert.equal(result.status, 0);
});
test('backup import validates first and honors dirty editor/map decisions', () => {
  const result = run({ P1B: '1', P1B_BACKUP_DECISIONS: '1' });
  assert.equal(result.status, 0);
});
test('backup replacement installs distinct incoming map and preserves source saved map', () => {
  const result = run({ P1B: '1', P1B_BACKUP_REPLACE: '1' });
  assert.equal(result.status, 0);
});
test('production Upload validates while draft open and honors editor prompt', () => {
  const result = run({ P1B: '1', P1B_BACKUP_UPLOAD_DIRTY: '1' });
  assert.equal(result.status, 0);
});
test('candidate draw/label/hit failures preserve authoritative map', () => {
  const result = run({ P1B: '1', P1B_BACKUP_FAIL: '1' });
  assert.equal(result.status, 0);
});

test('imported PDF Save/Open and source membership remain intact', () => {
  const result = run({ P1B: '1', P1B_BACKUP_PDF: '1' });
  assert.equal(result.status, 0);
});
test('deferred import hash cancellation, preparation failure, and recovery outcomes', () => {
  const result = run({ P1B: '1', P1B_BACKUP_CANCEL: '1' });
  assert.equal(result.status, 0);
});
test('destroy during deferred import cancels without installation', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_DESTROY: '1' }).status, 0);
});

test('stale pending import cannot resume after session replacement', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_STALE: '1' }).status, 0);
});

test('duplicate editor discard resumes import once despite repeated clicks', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_DUP: '1' }).status, 0);
});

test('old cancelled import cannot affect newer overlapping import', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_OVERLAP: '1' }).status, 0);
});
test('destroy while dirty-map decision awaits releases pending import', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_DESTROY_DECISION: '1' }).status, 0);
});
test('destroy while dirty-editor decision awaits releases pending import', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_DESTROY_EDITOR: '1' }).status, 0);
});
test('distinct A/B package overlap isolates old cancellation from new import', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_OVERLAP_DISTINCT: '1' }).status, 0);
});
test('late failure from cancelled A cannot affect active B import', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_LATE_FAIL: '1' }).status, 0);
});
test('repeated dirty-map Save/Discard clicks commit import once', () => {
  assert.equal(run({ P1B: '1', P1B_BACKUP_DUP_MAP: '1' }).status, 0);
});
test('storage status wording tracks save/restored/dirty lifecycle with accessible help', () => {
  assert.equal(run({ P1B: '1', P1B_STORAGE_COPY: '1' }).status, 0);
});
test('file Open and Save routes through writable document adapter with clean baseline', () => {
  assert.equal(run({ P1B: '1', P1B_DOCUMENT: '1' }).status, 0);
});
test('fallback file Open is clean and Save reports download handoff without clearing dirty', () => {
  assert.equal(run({ P1B: '1', P1B_DOCUMENT_FALLBACK: '1' }).status, 0);
});
test('Save and continue writes active document handle before Open replacement commits', () => {
  assert.equal(run({ P1B: '1', P1B_DOCUMENT_REPLACEMENT: '1' }).status, 0);
});
test('Import Backup clears inherited writable document identity', () => {
  assert.equal(run({ P1B: '1', P1B_DOCUMENT_IMPORT: '1' }).status, 0);
});
test('deferred applied save owner cannot be recreated for replacement session', () => {
  assert.equal(run({ P1B: '1', P1B_APPLIED_SESSION: '1' }).status, 0);
});
test('new/previous-local toolbar and form Save request .orbit without IndexedDB', () => {
  assert.equal(run({ P1B: '1', P1B_NEW_DOCUMENT: '1' }).status, 0);
});
test('fallback new Save and Save-and-continue keep dirty and pending replacement', () => {
  assert.equal(run({ P1B: '1', P1B_NEW_FALLBACK: '1' }).status, 0);
});
test('fallback Open File and Import Backup activate the owned input with intent', () => {
  assert.equal(run({ P1B: '1', P1B_FALLBACK_PICKER: '1' }).status, 0);
});
test('Save As cancellation/write/close failures keep A; deferred close adopts C with dirty later edits', () => {
  assert.equal(run({ P1B: '1', P1B_SAVE_AS: '1' }).status, 0);
});
test('obsolete deferred save cannot affect replacement session or newer save', () => {
  assert.equal(run({ P1B: '1', P1B_SAVE_LIFECYCLE: '1' }).status, 0);
});
test('destroy during deferred save suppresses late success adoption/status', () => {
  assert.equal(run({ P1B: '1', P1B_SAVE_DESTROY: '1' }).status, 0);
});
test('destroy during deferred save suppresses late failure/status', () => {
  assert.equal(run({ P1B: '1', P1B_SAVE_DESTROY_FAIL: '1' }).status, 0);
});
test('applied form Save blocks Open File until persistence completes', () => {
  assert.equal(run({ P1B: '1', P1B_FORM_BLOCK: '1' }).status, 0);
});
test('actual Open/Discard replacement invalidates pending A; late A success cannot affect B', () => {
  assert.equal(run({ P1B: '1', P1B_REPLACE_ACTUAL: '1' }).status, 0);
});
test('actual replacement invalidates pending A; late A close failure cannot affect B', () => {
  assert.equal(run({ P1B: '1', P1B_REPLACE_ACTUAL_FAIL: '1' }).status, 0);
});
test('cancelled Open preserves pending A save ownership and completion', () => {
  assert.equal(run({ P1B: '1', P1B_REPLACE_CANCEL: '1' }).status, 0);
});
test('Import Backup first Save uses .orbit picker before adopting and clears A handle', () => {
  assert.equal(run({ P1B: '1', P1B_IMPORT_SAVE: '1' }).status, 0);
});
test('Previous local maps first Save uses .orbit picker and preserves legacy record', () => {
  assert.equal(run({ P1B: '1', P1B_LOCAL_SAVE: '1' }).status, 0);
});
test('Previous local maps fallback first Save downloads without confirmed clean state', () => {
  assert.equal(run({ P1B: '1', P1B_FALLBACK_LOCAL: '1' }).status, 0);
});
test('Import Backup fallback applies once, Retry handoff, Close, and Save-and-continue Cancel/Discard', () => {
  assert.equal(run({ P1B: '1', P1B_FALLBACK_FORM_IMPORT: '1' }).status, 0);
});
test('Previous local fallback applies once, Retry handoff, Close, and Save-and-continue Cancel/Discard', () => {
  assert.equal(run({ P1B: '1', P1B_FALLBACK_FORM_LOCAL: '1' }).status, 0);
});
test('stale applied-operation Retry preflight rejects before handoff side effects', () => {
  assert.equal(run({ P1B: '1', P1B_STALE_RETRY: '1' }).status, 0);
});
test('Save As awaits permission, skips redundant request, and reports picker versus permission stages', () => {
  assert.equal(run({ P1B: '1', P1B_SAVE_STAGES: '1' }).status, 0);
});
