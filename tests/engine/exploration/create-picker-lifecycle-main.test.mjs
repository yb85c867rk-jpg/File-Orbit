import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const runner = fileURLToPath(new URL('./main-harness-init-runner.mjs', import.meta.url));
for (const mode of ['destroy-success', 'destroy-reject', 'replace-session', 'dialog-cancel', 'postinstall-destroy', 'postinstall-replace']) {
  test(`creation lifecycle ownership: ${mode}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'fileorbit-lifecycle-')); const marker = join(dir, 'completion.txt');
    const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', timeout: 30000, env: { ...process.env, P1B: '1', CREATE_PICKER_MODE: mode, LIFECYCLE_MARKER_FILE: marker } });
    const output = existsSync(marker) ? readFileSync(marker, 'utf8') : ''; rmSync(dir, { recursive: true, force: true });
    assert.equal(result.status, 0, output || 'child exited without completion evidence');
    assert.match(output, new RegExp('LIFECYCLE_COMPLETE:' + mode));
    assert.doesNotMatch(output, /LIFECYCLE_WATCHDOG/);
  });
}
