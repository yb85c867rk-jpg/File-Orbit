# REA 실행 기록 — Hypertree 의존 관계 / 전후 구조

- 날짜: 2026-10-25 (Pacific/Auckland)
- 대상: `C:\Users\openw\Documents\Projects\visual-directory`
- 목적: REA로 Hypertree dependency closure와 리팩터링 전후 구조를 분석
- 결과: **설치·CLI 실행은 성공, JavaScript 분석은 NOT RUN** (`source-transfer`에서 EPERM)

## 1. 가용성 확인 (실행 전)

| 항목 | 결과 |
|---|---|
| `Get-Command rea` | 없음 (PATH에 없음) |
| `npm ls -g --depth=0` | empty |
| `npx --no-install rea --version` | 실패 — 기본 npm cache `C:\Users\openw\AppData\Local\npm-cache`에서 EPERM |
| MCP | 이 세션에 REA MCP tool이 노출되지 않음 (`rea_*` 없음) |
| Node | v24.12.0 |
| npm | 11.6.2 |
| registry 최신 | `rea-agents@6.7.0` (2026-10-25 조회) |
| registry engines | `^22.19.0 \|\| ^24.11.0 \|\| >=26.0.0` — local 24.12.0 충족 |
| package 크기 | fileCount 1775, unpacked 28,575,703 bytes |
| package integrity | `sha512-yhIx2ioJYYT1C/tONfYeitC6LhnKmCh+ZwRUOgYuhSc733lGhkkt73zhug9WmLgxoMdKuqIYGCoBfD4fXkOhFw==` |

전역 설치는 하지 않았다. `rea setup`, MCP registration, global agent config 변경도 하지 않았다.

## 2. Visual Directory 한정 설치 (실행함)

```powershell
$root = "C:\Users\openw\Documents\Projects\visual-directory"
$tool = "$root\.rea-tool"
New-Item -ItemType Directory -Force -Path "$tool\.npm-cache","$tool\.npm-logs","$tool\.tmp" | Out-Null
Set-Content -Path "$tool\.npmrc" -Value "" -Encoding ascii

$env:npm_config_cache = "$tool\.npm-cache"
$env:npm_config_logs_dir = "$tool\.npm-logs"
$env:npm_config_userconfig = "$tool\.npmrc"
$env:npm_config_fund = "false"
$env:npm_config_audit = "false"
$env:TEMP = "$tool\.tmp"
$env:TMP = "$tool\.tmp"

npm install --prefix "$tool" --no-save --no-package-lock --omit=optional --ignore-scripts rea-agents@6.7.0
```

- 결과: **147 packages, 24s, exit 0**
- 전역 npm 목록은 여전히 empty; `package.json`/lockfile은 project root에 생성하지 않음
- 설치 위치: `$root\.rea-tool\node_modules\rea-agents`
- CLI: `node "$tool\node_modules\rea-agents\scripts\rea.mjs" --version` → `6.7.0`

## 3. `rea doctor` (요약)

전체 JSON: `docs/engine/rea/rea-doctor.json`

- `node`: healthy (24.12.0)
- `host`: healthy (win32 x64)
- native engines(Hopper/Ghidra/IDA/JADX/Kuna): missing — **JavaScript 정적 분석에는 필수가 아님**
- skill/registration: `config_drift`/`missing` — `rea setup`으로 고치지 않았다(전역 설정 변경 금지)
- `healthy: false`는 위 항목 때문이며, JS 분석 실패의 직접 원인과 별개다.

## 4. JavaScript 분석 시도 (실패)

### 4.1 Legacy bundle

입력은 byte-identical copy다.

- `$root\.rea-analysis\legacy\jit.js`
- SHA-256 `4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`

```powershell
$env:TEMP = "$root\.rea-analysis\tmp"
$env:TMP  = "$root\.rea-analysis\tmp"
node "$tool\node_modules\rea-agents\scripts\rea.mjs" `
  analyze-javascript-application "$root\.rea-analysis\legacy" `
  --artifact-format directory --format json
```

결과: **exit 1**, `execution_failure`

```text
phase: source-transfer
message: EPERM: operation not permitted, open
  '<temp>\rea-javascript-analysis-<uuid>\<uuid>.source'
```

- 기본 TEMP(`C:\Users\openw\AppData\Local\Temp\dsh-...`)에서 1차 실패
- project-local TEMP(`$root\.rea-analysis\tmp`)로 재시도해도 동일 EPERM
- 오류 JSON: `docs/engine/rea/legacy-analysis-attempt.json`

### 4.2 통제 실험: 2-line file

파일 크기/파싱 문제인지 분리하기 위해 동일 명령을 작은 파일에 실행했다.

- `$root\.rea-analysis\tiny\app.js` (`export const answer = 42;` 등)
- 결과: **동일 EPERM** (`source-transfer`)
- 오류 JSON: `docs/engine/rea/tiny-analysis-attempt.json`

→ 대용량 bundle이나 Hypertree 고유 문제가 아니라, 이 환경에서 REA의 **source transfer 단계 자체**가 막힌다.

## 5. 얻은 REA evidence (부분)

실패 응답에도 inventory Evidence는 남았다.

| 항목 | 값 |
|---|---|
| `evidence_id` | `ev_55e2754e3a616d7861d94153dbca6e0d50d70e596c497f1568ad454231a543f6` |
| application graph | `jag_f383d1ab412b6c8d02c433d59bed70726a0a3dfd6c5cdf20a3cec66d9dbc81c4` |
| semantic graph | `jsrg_7589882a514a41b0b4973dc25fc4a806694cbb1893332b139e3116ffda850a5c` |
| relevant files | 1 (`jit.js`) |
| text bytes read | 530,341 |
| parsed JS files | 0 |
| skipped JS files | 1 |
| modules | 0 |
| findings | 0 |
| coverage | partial |

**해석:** REA는 legacy artifact를 **단일 classic-script asset**으로 inventory했을 뿐, AST/semantic 관계는 얻지 못했다. 따라서 REA로 dependency closure나 module graph를 검증한 것이 아니다.

## 6. 전후 구조 분석 상태

| 대상 | 상태 | 이유 |
|---|---|---|
| Before: legacy `jit.js` | **부분만 관측** | inventory 1 asset, semantic 0 modules. dependency 관계는 REA로 확인 불가 |
| After: ES2026 modules | **NOT RUN** | 아직 구현되지 않음. 분석할 artifact가 없음 |
| Before↔After 비교 | **NOT RUN** | After artifact 부재 + REA source-transfer 차단 |

REA 없이 확인한 dependency closure와 legacy pattern은 계획 §12.1/§12.2의 **direct source audit (E-SRC)** 이며, REA 결과와 섞지 않는다.

## 7. 원인과 한계

- **관측된 사실:** REA가 Windows private runtime root를 만들고 그 안에 `.source` 파일을 쓰는 단계에서 EPERM.
- **추정 [Unverified]:** DSH sandbox의 제한 토큰과 REA `WindowsPrivateRuntime`의 private DACL 조합이 쓰기 권한을 만족하지 못할 가능성. DACL이 실제 원인인지 이번 조사에서 증명하지 않았다.
- REA를 우회하기 위해 REA 코드/DACL/보안 설정을 수정하지 않았다.
- REA의 정적 분석은 실행/렌더링을 증명하지 않는다. 브라우저/기기 검증은 별도 NOT RUN이다.
- REA MCP는 사용하지 않았다(노출 없음, `rea setup`은 전역 설정 변경이므로 금지).

## 8. 재현/운영 방법 (같은 환경에서 재시도할 때)

1. 위 2절의 local install을 그대로 실행한다(전역 `-g` 금지).
2. `node .rea-tool\node_modules\rea-agents\scripts\rea.mjs --version`으로 6.7.0 확인.
3. 분석:
   ```powershell
   node .rea-tool\node_modules\rea-agents\scripts\rea.mjs `
     analyze-javascript-application .\.rea-analysis\legacy `
     --artifact-format directory --format json
   ```
4. 같은 `source-transfer` EPERM이 나오면 **환경 blocker**로 기록하고, DACL/보안 설정을 바꾸지 않는다.
5. 전역 설정이 허용된 별도 환경에서 실행하거나, REA가 수정된 버전을 제공할 때 재시도한다.

## 9. 정리

- `.rea-tool`(215.4MB, 8,598 files)과 `.rea-analysis`는 분석 후 제거했다.
- 보존한 evidence: 이 문서, `rea-version.txt`, `rea-doctor.json`, `rea-capabilities.json`, `legacy-analysis-attempt.json`, `tiny-analysis-attempt.json`.
- root `jit.js`, `vendor/jit/jit.2.0.1.js`, harness, plan 이외의 파일은 변경하지 않았다.
