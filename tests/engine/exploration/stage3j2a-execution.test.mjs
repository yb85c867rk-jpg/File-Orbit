import test from 'node:test'; import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const runner=fileURLToPath(new URL('./main-harness-init-runner.mjs',import.meta.url));
test('Stage 3J-2A actual main Create/edit/toolbar/save/save-as/download routing', () => { const result=spawnSync(process.execPath,[runner],{stdio:'inherit',timeout:120000,env:{...process.env,STAGE3J_ROUTING:'1'}}); assert.equal(result.status,0); });
