# Visual Directory V2 구현 계획

* 작성일: 2026-10-25
* 상태: 구현 전 계획. 이 문서만 생성했으며 애플리케이션 코드, 의존성, lockfile, `jit.js`, 플랫폼 설정은 변경하지 않았다.
* 대상 저장소: `C:\\\\\\\\Users\\\\\\\\openw\\\\\\\\Documents\\\\\\\\Projects\\\\\\\\visual-directory`
* 기준 파일: `jit.js` (530,341 bytes, 18,541 lines, SHA-256 `4A413A0A…921546F`)
* 표기:

  * **\[Observed]** 소스 코드/파일/공식 문서에서 직접 확인
  * **\[Executed]** 이번 조사에서 실제로 실행해 확인
  * **\[Deduced]** 확인된 사실에서 추론
  * **\[Unverified]** 아직 검증하지 못함

> 이 계획의 “V2”는 \\\\\\\*\\\\\\\*Visual Directory 프로젝트의 향상된 시각화 기반과 애플리케이션 아키텍처\\\\\\\*\\\\\\\*를 뜻한다. 공식 upstream JIT 릴리스가 아니며, 그렇게 표기하거나 배포하지 않는다.

\---

## 0\. Executive recommendation (결론 요약)

1. **`jit.js`는 JIT 2.0.1로 표기된 upstream 비압축 concatenated build와 바이트 단위로 동일하다.** MIT 라이선스이며, 로컬 수정이나 기존 애플리케이션 통합은 없다. 프로젝트에는 이 파일 하나만 존재한다. 다만 2.0.1 tag에는 해당 경로의 파일이 없고 2.0.2 tag 산출물과도 다르므로, “공식 2.0.1 릴리스 산출물”과의 동일성은 확정하지 않았다. **\[Observed]**
2. **JIT은 SpaceTree(ST) 기반의 폴더 트리에는 충분히 적합하지만, 그대로 모바일/Retina에 출시할 수는 없다.** 핵심 결함은 high-DPI 미지원, lifecycle/dispose 부재, 숨겨진 노드까지 포함하는 O(N) hit testing, 파일명을 `innerHTML`로 넣는 경로다. **\[Observed + Executed]**
3. **V2는 “A. 엔진 보존 + 어댑터”만으로는 부족하고, “B. 어댑터 + 최소 패치 4개”가 현실적이다.** 벤더 baseline은 그대로 보존하고, 빌드 시 적용하는 작은 patch set으로 DPR, dispose, hit-test visible, label textContent를 고친다. ST의 layout/animation을 재작성하지 않는다. **\[Deduced]**
4. **아키텍처는 Tauri 2 (Windows/macOS/Android/iOS)를 권장한다.** 단, Tauri의 공식 dialog는 모바일에서 folder picker를 지원하지 않고, fs는 앱 폴더로 제한되며, opener는 모바일에서 URL만 연다. 따라서 **모바일 SAF/document-picker와 파일 열기/공유를 담당하는 좁은 custom plugin이 필수**다. **\[Observed]**
5. **Fallback은 Electron(desktop) + Capacitor(mobile)이다.** 데스크톱의 Chromium 일관성과 macOS security-scoped bookmark가 강점이지만, shell과 IPC가 두 벌이 되고 모바일에는 결국 custom SAF enumeration plugin이 필요하다. **\[Observed + Deduced]**
6. **모바일 파일 접근 spike를 Phase 4에 두지 말고 Phase 1\~2와 병렬로 앞당긴다.** 이 결과가 아키텍처를 무효화할 수 있기 때문이다. Go/No-Go gate를 Phase 3 투자 전에 둔다. **\[Deduced]**
7. **REA는 이번에 실행하지 못했다 (NOT RUN).** CLI/MCP 미설치, npm cache 쓰기 차단, 단일 classic-script bundle이라는 대상 특성 때문이다. 설치는 가능하지만 이 계획의 결론은 REA Evidence에 의존하지 않는다. **\[Executed]**
8. 아래 성능 수치는 모두 **측정 전 target budget**이며, “fully rendered large graph”를 약속하지 않는다. 전체 indexed entries와 실제 rendered nodes를 분리한다.

\---

## 1\. 조사 방법과 한계

### 1.1 수행한 확인

|확인|방법|결과|
|-|-|-|
|파일 무결성|`Get-FileHash` (SHA-256/SHA-1/MD5), `git hash-object`|해시 고정|
|출처|GitHub Contents API의 blob SHA/size와 로컬 git blob 비교|upstream master와 동일|
|구조|`File:` marker, namespace, 메서드/prototype 추출|18,541줄, 20개 namespace|
|기능|소스 정독 (ST, Graph, Canvas, Label, Events, Loader, Layouts)|capability matrix 작성|
|런타임|Node 24.12.0 `vm` + DOM stub으로 JIT 로드 및 Graph probe|버전/중복 ID/깊이 한계 확인|
|REA|`Get-Command rea`, `npm ls -g`, npm registry, 공식 docs|미설치, NOT RUN|
|프레임워크|Tauri/Electron/Capacitor/Android/Apple/MDN 공식 문서|현재 제약 확인|

### 1.2 하지 않은 것

* 실제 브라우저 canvas 렌더링, WKWebView/Android WebView 측정은 하지 않았다.
* macOS, Android 기기, iOS/iPadOS 기기에서 실행하지 않았다.
* REA를 설치/실행하지 않았다. MCP 설정을 변경하지 않았다.
* `jit.js`를 수정하거나 복사본을 프로젝트에 만들지 않았다.
* 애플리케이션 코드, `package.json`, lockfile, 플랫폼 설정을 만들지 않았다.

### 1.3 증거의 성격

* 이 문서의 line number는 모두 로컬 `jit.js` 기준이다.
* **\[Executed]** 항목은 Node VM에서의 probe이며, 브라우저 렌더링을 의미하지 않는다.
* 플랫폼 동작은 공식 문서로 확인했지만, 실제 provider/기기 조합은 \*\*\[Unverified]\*\*로 남긴다.

### 1.4 Product assumptions / non-goals (제품 전제와 비목표)

* Local-first, offline 사용을 전제로 한다. 계정, cloud upload, synchronization, AI processing, backend service는 초기 릴리스에 없다.
* 사용자가 선택한 location만 접근하고, source file은 **read-only**로 다룬다.
* source folder 전체를 앱 저장소로 복사하지 않는다. 단, iOS provider가 open-in-place를 지원하지 않아 OS가 copy-on-open을 수행하는 경우에는 “imported copy”로 명시하고 원본과 구분한다.
* Windows/macOS/Android/iOS가 release gate다. Linux desktop과 standalone browser edition은 **optional**이며, 같은 수준의 filesystem parity를 약속하지 않는다.

\---

## 2\. 저장소 및 `jit.js` 감사

### 2.1 저장소 현황

|항목|값|비고|
|-|-|-|
|파일|`jit.js` 1개|하위 디렉터리 없음|
|크기|530,341 bytes|18,541 lines|
|`package.json`|없음|빌드/스크립트 없음|
|`node\\\\\\\_modules`/lockfile|없음|의존성 없음|
|`src/`, `tests/`, `docs/`|감사 시점에 없음|이 계획 문서가 첫 docs 항목|
|`.git`|없음|로컬 이력 없음|
|LICENSE 파일|없음|라이선스는 `jit.js` 헤더에 포함|
|기존 앱 통합|없음|호출부/데모/설정 없음|

결론: 현재 프로젝트는 **“벤더링된 단일 라이브러리 파일”** 상태이며, 보존해야 할 기존 애플리케이션 동작은 없다. “기존 layout behavior”의 기준은 upstream JIT의 ST 동작 자체다.

### 2.2 출처와 무결성

|항목|값|
|-|-|
|로컬 SHA-256|`4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F`|
|로컬 SHA-1|`65F92C0EF4910AC6847C5BD8CA24276A0E241E33`|
|로컬 MD5|`98DB9441AAD61D07FD1FF967498883FC`|
|git blob SHA-1|`9ea1c611fff44e931d93ddfd4a2f921db452b386`|
|upstream master `Jit/jit.js` blob|`9ea1c611fff44e931d93ddfd4a2f921db452b386`, size 530,341|
|upstream 2.0.2 tag `Jit/jit.js` blob|`ff54faddfdbcfa8ef9ad6b62d24f3e3a6b8dbb98`, size 532,383|
|version string|`$jit.version = '2.0.1'` (`jit.js:47`)|
|copyright|“Copyright (c) 2013 Sencha Inc. - Author: Nicolas Garcia Belmonte” (`jit.js:2`)|
|license|MIT (헤더 `jit.js:2-20`, upstream `LICENSE`와 동일)|

**판정:** 로컬 파일은 `philogb/jit` master의 `Jit/jit.js`와 **바이트 단위로 동일**하다. 즉 로컬 포크/수정은 없다. 다만 2.0.2 tag의 산출물과는 다르므로, “2.0.1 공식 릴리스”라고 단정하지 않고 \*\*“upstream master의 2.0.1 표기 build”\*\*로 기록한다. 정확한 tag provenance는 추가 확인이 필요하다. **\[Observed]**

**유지보수 사실:** upstream은 2021-07-09 이후 push가 없고 open issue가 87개다. tag는 2.0.2까지 존재하지만, 이 파일은 2.0.2 산출물이 아니다. 공식 지원을 기대할 수 없으므로 V2는 **project-local vendor + patch set**으로 관리한다. **\[Observed]**

**라이선스 의무:** MIT이므로 소프트웨어의 모든 복사본/상당 부분에 copyright와 permission notice를 포함해야 한다. copyleft는 아니며, 파생 patch에도 원 저작권 고지를 유지한다. upstream 이름/상표를 “공식 V2”처럼 사용하지 않는다.

### 2.3 무엇이 들어 있나

`File:` marker 기준으로 Core, Options(AreaChart/Margin/Canvas/Tree/Node/Edge/Fx/Label/Tips/NodeStyles/Events/Navigation/Controller), Extras, Canvas, Polar, Complex, Graph, Graph.Op, Helpers, Graph.Plot, Graph.Label, Loader, Layouts, Spacetree, AreaChart, BarChart, Sunburst, PieChart, Icicle, ForceDirected, Treemap, RGraph, Hypertree가 모두 들어 있다.

관련 있는 것:

* `$jit.ST` (Spacetree): constrained tree, focus/expand/collapse, animation (`jit.js:8674-10282`)
* `$jit.Canvas`: 2D canvas widget (`jit.js:2714-3255`)
* `$jit.Graph` / `Graph.Op` / `Graph.Plot` / `Graph.Label`: 데이터 모델, 증분 연산, 렌더링, label (`jit.js:3977-8083`)
* `$jit.RGraph` (radial)와 `$jit.Hypertree` (hyperbolic): 대안 layout (`jit.js:17201-18541`)
* `Loader`: JSON tree/graph 입력 (`jit.js:8086-8335`)

관련 없거나 초기 릴리스에서 쓰지 않는 것: AreaChart, BarChart, PieChart, Sunburst, Icicle, Treemap, ForceDirected. 이들은 530KB 번들에 포함되어 있지만, 초기 V2에서 로드/사용하지 않는다.

### 2.4 Capability matrix (기능 비교)

|Capability|Evidence: file/symbol/line|Existing support|Gap|Proposed action|
|-|-|-|-|-|
|SpaceTree layout|`$jit.ST` `jit.js:8733`; config `8791-8800`; `Layouts.Tree` `8435-8669`|Yes. `levelsToShow=2`, `constrained=true`, `levelDistance=30`, rectangle nodes|level 기반 culling만 있음. wide folder를 node 수로 제한하지 않음|ST를 primary layout으로 사용. adapter에서 projection/windowing|
|RGraph|`$jit.RGraph` `17250-17299`|Yes. radial, `levelDistance=100`, Polar 좌표|폴더 트리 탐색에는 방사형이 덜 직관적|초기 미사용. “방사형 보기” 옵션 후보|
|Hypertree|`$jit.Hypertree` `17902-17918`|Yes. hyperbolic, `duration=1500`, `fps=35`|깊은 트리에서 label/클릭 정확도 및 성능 위험|초기 미사용. spike 후 옵션|
|Tree/graph 입력|`Loader.construct` `8096-8145`; `loadJSON` `8263-8275`|Yes. tree `{id,name,data,children}`, graph array `adjacencies`|파일명/경로 보안 속성이 없음|domain → projection 변환. 파일명은 label로만|
|Node identity|`this.nodes = {}` `4024`; `addNode` `4139-4154`|String key. 중복 ID는 조용히 무시(첫 값 유지)|중복/비정상 ID를 감지하지 않음|adapter가 `vd-` prefix의 고유 ID 생성, 중복 검증|
|Labels|`Options.Label` `1553-1564`; HTML `7943-7958`; ST placement `9928-9985`; Native `7654-7682`|HTML/SVG/Native. HTML label은 `div`, `tag.id = node.id`|truncation/ellipsis 없음. DOM id가 node id와 동일|HTML label + `textContent`, CSS ellipsis, safe DOM id|
|Icons / custom rendering|`ST.Plot.NodeTypes` `10058-10119`; custom type docs `10033-10056`; no `drawImage`|shape: none/circle/rectangle/ellipse/square. custom render/contains 가능|내장 image/icon node type 없음|label DOM에 icon span. 필요 시 custom NodeType|
|Hit testing|`getNode` `2099-2112`; event pos `2082-2097`|canvas 좌표 기반 `contains`. label target 경로 `1963-1973`|O(N) linear scan, `drawn/exist` 미확인, 숨은 노드 hit 가능|label click + adapter spatial index. patch로 visible filter|
|Expand/collapse|`select` `9216-9245`; `onClick` `9275-9323`; `contract/expand` `9395-9463`|Yes. focus animation, contract/expand|hidden node를 삭제하지 않고 유지 (`9417-9422`)|projection에서 제거. `select`/`onClick` 선택 사용|
|Incremental add/remove|`Graph.Op.sum` `5657`; `morph` `5764`; `removeNode` `5447`; `addSubtree` `9155`; `removeSubtree` `9185`|Yes. JSON diff/morph, fade/replot|큰 변화에서 animation 비용 큼|작은 delta는 `morph`, 큰 변화는 `loadJSON`+`select`|
|Lazy subtree request|`requestNodes` `8982-8998`; `Group.requestNodes` `9369-9389`|Yes. `controller.request(nodeId, level, cb)`|callback 기반, 취소 없음, leaf 조건이 제한적|adapter가 자체 lazy load. JIT request hook은 옵션|
|Animation|`Animation` `setInterval` `869-876`; `Graph.Plot.animate` `7156-7187`; `plotStep` `9512-9554`|Yes. 40fps default, transitions|rAF 아님, frame마다 전체 graph 순회|bounded graph + 짧은 duration. 필요 시 rAF patch|
|Pan / zoom|`Navigation` `2650-2709`; wheel `2658-2663`; drag `2666-2703`; canvas scale `2997-3007`|Mouse pan, wheel zoom, canvas transform|touch pan/pinch 없음. fit-to-view API 없음|adapter가 pointer/pinch/fit 직접 구현|
|Touch|touch listeners `2033-2041`; callbacks `2289-2317`|touch tap/drag callback|pinch 없음, `preventDefault` 없음, `touch-action` 없음|`touch-action:none`, pointer events, 자체 gesture|
|High-DPI|canvas size = CSS px `3135-3145`, `3169-3177`; `devicePixelRatio` 0회|No|Retina/mobile에서 흐림|patch: DPR backing store + CSS size|
|Resize|`canvas.resize` `2941-2953`; no `ResizeObserver`|Manual only|container resize 자동 감지 없음|adapter가 ResizeObserver로 호출|
|Accessibility|canvas rendering; `aria-\\\\\\\*`/`role`/`tabindex`/`keydown` 0회|No|canvas는 AT에 노출되지 않음|parallel ARIA tree/list + toolbar. canvas `aria-hidden`|
|Lifecycle cleanup|no `dispose`; `disposeLabel`만 `7846`; window scroll listener `2853-2859`|No|listener/timer/animation leak|patch `dispose()` + adapter `destroy()`|
|Module format|IIFE `24`, tail `18538-18541`; `this.$jit` `38`; no `export`/`define`/`use strict`|Classic script global|bundler/ESM에서 top-level `this` 문제|vendor를 classic script로 로드, runtime guard|
|Deep hierarchy|`eachLevel` recursion `5106-5121`; `design`/`red` `8618-8667`|Yes for normal depth|5,000 depth에서 stack overflow (probe)|depth cap, list fallback, projection flatten|
|Wide folder|culling `getRightLevelToShow` `8045-8081`; `getTreeBaseSize` `9645-9653`|level 단위 culling|한 folder의 수천 children을 그대로 렌더|per-folder window + “more” node + list view|
|Hit-test performance|`getNode` `2102-2108`|O(N) per event|1,500 nodes에서도 매 move마다 비쌈|label target + spatial index|
|Tests / demos|로컬 없음; upstream에 `Tests/`, `tests.py` 존재|upstream만|로컬 회귀 보호 없음|Phase 1에서 harness/fixture 구축|
|License|`jit.js:2-20`; upstream LICENSE|MIT|없음|고지 유지, patch 명시|

### 2.5 실행한 runtime probe

Node 24.12.0의 `vm`에 DOM stub을 넣고 `jit.js`를 classic script로 로드했다. canvas/DOM 상호작용은 실행하지 않았다.

|Probe|결과|
|-|-|
|JIT load|성공. `$jit.version === '2.0.1'`|
|namespace|`ST`, `RGraph`, `Hypertree`, `Graph`, `Canvas`, `Trans` 모두 function/object|
|중복 node id|`nodes` 2개, 첫 `name` 유지, 중복은 조용히 무시|
|`computeLevels` depth 20,000|성공 (iterative BFS)|
|`eachLevel` depth 5,000|`RangeError: Maximum call stack size exceeded`, 2,459 nodes 방문 후 실패|
|`eachLevel` depth 20,000|`RangeError`, 2,143 nodes 방문 후 실패|
|`Loader.construct` depth 5,000|성공 (5,000 nodes)|

해석:

* 깊은 트리에서 **모든 재귀 경로가 동일하게 실패하는 것은 아니다.** `computeLevels`와 `construct`는 5,000 depth를 견뎠고, `eachLevel`은 실패했다. 브라우저 stack 크기는 다르므로 수치는 환경 의존적이다. **\[Executed, 환경 한정]**
* 따라서 “5,000 depth면 무조건 실패”라고 일반화하지 않고, **Phase 1 fixture에서 브라우저별로 다시 측정**한다.
* 중복 ID가 조용히 무시되는 동작은 파일 시스템 entry ID 설계에서 반드시 방어해야 한다.

### 2.6 사실 / 추론 / 미검증

**사실 \[Observed/Executed]**

* 단일 MIT 파일, upstream master와 동일, 로컬 수정/통합 없음.
* Canvas 2D만 구현되어 있다. `Canvas.Base\\\\\\\['2D']`만 존재하고 `3D`는 없다 (`3118`).
* DPR, rAF, ResizeObserver, keyboard, ARIA, pinch가 없다.
* HTML label은 `tag.id = node.id`를 사용하고, `NodeDim`은 `label.innerHTML = n.name`을 사용한다 (`8383`).
* ST는 constrained level culling을 하지만, 한 level의 child 수를 제한하지 않는다.
* hit testing은 `graph.nodes`를 순회하며 `drawn/exist`를 확인하지 않는다.
* dispose API가 없고, window scroll listener가 익명 함수로 등록된다.

**추론 \[Deduced]**

* Retina/macOS/iPhone에서 1:1 canvas는 흐릿하게 보인다. CSS 크기와 backing store가 같기 때문이다.
* 1,500+ visible nodes에서 `mousemove`마다 O(N) hit test는 frame budget을 넘을 수 있다.
* 파일명에 HTML metacharacter가 들어가면 `innerHTML` 경로에서 XSS가 가능하다. 현재 앱은 없지만, V2에서 그 경로를 재사용하면 위험이 된다.
* JIT을 ESM으로 `import`하면 top-level `this`가 undefined가 되어 `this.$jit` 설정이 실패할 수 있다. classic script 로드가 필요하다.
* 모바일 WebView에서 1,500 nodes + HTML labels는 메모리/레이아웃 비용이 크다.

**미검증 \[Unverified]**

* 실제 WKWebView/Android WebView에서의 FPS, DPR 선명도, 1,500 nodes 메모리.
* iOS document provider의 open-in-place/폴더 bookmark 안정성.
* Android SAF provider별 `DocumentsContract` column/child query 편차.
* Tauri custom plugin의 byte streaming 성능.
* REA 분석 결과.

\---

## 3\. REA 조사 결과

### 3.1 설치/가용성 확인

|확인|결과|
|-|-|
|`Get-Command rea`|없음 (PATH에 없음)|
|`npm ls -g --depth=0`|empty|
|MCP 도구|이 세션에 REA MCP 도구가 노출되지 않음|
|Skill|`reverse-engineer-anything` skill은 설치되어 있으나, 이는 지침일 뿐 CLI/MCP 등록이 아님|
|최신 npm version|`rea-agents@6.7.0` (2026-10-25 registry 조회)|
|Node|v24.12.0, npm 11.6.2|
|npm cache 쓰기|`EPERM` (`C:\\\\\\\\Users\\\\\\\\openw\\\\\\\\AppData\\\\\\\\Local\\\\\\\\npm-cache\\\\\\\\\\\\\\\_cacache\\\\\\\\tmp\\\\\\\\...`). workspace-write sandbox에서 차단|
|분석 실행|**NOT RUN**|

버전 요구사항에 문서 간 차이가 있다.

* README: Node 22.23.4+, 24.22.1+, 26.12.1+
* npm `engines`: `^22.19.0 || ^24.11.0 || >=26.0.0`

로컬 24.12.0은 npm engines는 만족하지만 README의 24.22.1+에는 미달한다. 재현성을 위해 \*\*Node 24.22.1+ (또는 26.12.1+)\*\*를 권장한다.

> 참고: 이 세션의 REA skill 문서는 `npx -y rea-agents@6.4.0` 예시를 포함하지만, 2026-10-25 registry latest는 \\\\\\\*\\\\\\\*6.7.0\\\\\\\*\\\\\\\*이다. 설치/분석은 6.7.0으로 고정한다.

### 3.2 읽은 공식 문서와 적용 가능 workflow

* REA README: 설치, CLI, MCP, Node 요구사항, JavaScript/Electron 분석 범위
* `docs/javascript-application-workflows.md`: `analyze\\\\\\\_javascript\\\\\\\_application`, `inspect\\\\\\\_analysis\\\\\\\_view`, `trace\\\\\\\_application\\\\\\\_feature`, `trace\\\\\\\_javascript\\\\\\\_semantics`, `compare\\\\\\\_application\\\\\\\_versions`, `compare\\\\\\\_source\\\\\\\_to\\\\\\\_bundle`, `compare\\\\\\\_javascript\\\\\\\_export\\\\\\\_shapes`
* `docs/cli.md` 계열 명령 형식: `rea analyze-javascript-application <dir> --json`

이 프로젝트에 적용 가능한 것은 **static JavaScript analysis**다. native decompiler/provider는 필요하지 않다. 다만 대상이 `package.json` 없는 단일 classic-script bundle이므로, REA가 만들 module graph는 사실상 1개 module이고 import/export/IPC 경계도 없다. 따라서 **module boundary 분석의 정보 이득이 낮다.** 반면 semantic trace로 timer/listener/`innerHTML` 흐름을 확인하는 보조 용도는 가능하다. **\[Deduced]**

REA는 **조사 도구**이며, 이 애플리케이션의 rendering engine, framework, 또는 자동 refactoring 보장이 아니다. 분석 결과가 있더라도 최종 판단은 소스/테스트/기기 측정으로 한다.

### 3.3 NOT RUN의 의미

* REA Evidence ID가 없고, REA가 확인한 module/import/export/IPC 결과도 없다.
* 이 문서의 JIT 결론은 **소스 정독 + 로컬 hash + Node VM probe + 공식 문서**에 근거한다.
* “REA로 확인했다”고 쓰지 않는다.
* REA가 없어서 막힌 결론은 없다. 다만 “adapter 분리 후 export shape 비교”, “event/timer semantic trace”는 아직 수행하지 않았다.

### 3.4 설치 및 실행 절차 (다음 담당자용)

프로젝트 의존성으로 추가하지 말고, 사용자 전역 도구로 설치한다. 설치는 workspace 밖(npm global/cache)에 쓰므로 sandbox 승인이 필요할 수 있다.

```powershell
# 1) Node 확인 (README 기준 24.22.1+ 권장)
node --version

# 2) 설치 (global)
npm install --global rea-agents@6.7.0
rea --version

# 3) 단일 bundle 분석
rea analyze-javascript-application "C:\\\\\\\\Users\\\\\\\\openw\\\\\\\\Documents\\\\\\\\Projects\\\\\\\\visual-directory" --json > rea-jit.json
```

`npx` 1회 실행으로도 가능하다.

```powershell
npx -y rea-agents@6.7.0 analyze-javascript-application "C:\\\\\\\\Users\\\\\\\\openw\\\\\\\\Documents\\\\\\\\Projects\\\\\\\\visual-directory" --json
```

MCP 등록은 대화형 설정을 포함하므로 이번 작업에서는 실행하지 않았다. 필요 시:

```powershell
npx rea-agents@6.7.0 setup
# 또는 수동 MCP 등록 후
npx rea-agents@6.7.0 mcp
```

`setup`은 선택한 agent의 MCP 설정 파일과 skill instructions를 수정하므로, 실행 전에 대상 경로와 백업을 확인해야 한다. 이 작업에서는 대화형 setup을 실행하지 않았고 어떤 global agent 설정도 변경하지 않았다.

### 3.5 REA로 아직 확인해야 할 것

1. **Phase 1:** `analyze\\\\\\\_javascript\\\\\\\_application`으로 `jit.js`의 module/정적 경계를 기록하고, `trace\\\\\\\_application\\\\\\\_feature` seed로 `addEventListener`, `setInterval`, `innerHTML`, `devicePixelRatio`를 조회해 lifecycle/hotspot 후보를 확인한다.
2. **Phase 2 이후:** adapter를 ESM package로 분리한 뒤 `compare\\\\\\\_javascript\\\\\\\_export\\\\\\\_shapes`로 before/after export shape를 비교한다. `jit.js` 자체는 export가 없으므로 이 비교는 **adapter package에만** 적용한다.
3. **Phase 2 회귀:** `compare\\\\\\\_application\\\\\\\_versions`로 patch 전/후 module graph가 의도치 않게 바뀌지 않았는지 확인한다.
4. **한계:** static analysis는 runtime rendering/FPS를 증명하지 않는다. 성능은 Phase 1/4의 실제 측정으로만 판정한다.

\---

## 4\. `jit.js` V2 리팩터링 전략

### 4.1 선택지 A vs B

|기준|A. 엔진 보존 + 현대적 adapter|B. adapter + 내부 점진 추출/현대화|
|-|-|-|
|초기 속도|빠름|중간|
|layout/animation 보존|완전|완전 (ST는 그대로)|
|Retina/DPR|불가 (경계에서 해결 불가)|patch로 해결|
|dispose/leak|불가 (내부 listener 회수 불가)|patch로 해결|
|숨은 노드 hit test|부분 회피(label만 사용)|patch로 해결|
|파일명 XSS|`innerHTML` 경로 회피로 완화|`textContent` patch로 제거|
|유지보수|작음|patch set 관리 필요|
|upstream 의존|없음|없음 (vendor 고정)|
|장기 확장|제한|Canvas/Renderer 분리까지 가능|

**권장: B-lite.** 정확히는 “stable adapter를 먼저 만들고, 경계에서 해결할 수 없는 4개만 vendor patch로 고친다.” ST layout/animation을 ES module로 재작성하는 “B-full”은 이번 범위가 아니다.

근거:

* A만으로는 DPR과 dispose를 **경계에서 해결할 수 없다.** `Canvas.Base`는 IIFE 내부 지역 변수라 외부에서 교체할 수 없고, window scroll listener는 익명 함수라 제거 핸들이 없다. **\[Observed]**
* B-full은 Kennedy tree layout, contraction/expansion transform, label placement를 다시 구현해야 하므로 회귀 위험이 크고, “jit.js를 기반으로 한다”는 요구와도 멀어진다.
* 4개 patch는 각각 독립적이고 테스트 가능하며, 변경량을 작게 유지할 수 있다.

**Hard limitation PoC:** DPR/dispose patch가 WKWebView/Android WebView에서 불안정하면, 200-node ST를 DPR 2에서 mount하고 50회 mount/unmount + 30fps pan을 측정하는 최소 PoC를 먼저 만든다. 이 PoC가 실패하면 **다른 라이브러리로 조용히 교체하지 않고** 별도 아키텍처 결정(예: B안 전환 또는 native renderer)으로 넘긴다.

### 4.2 벤더 baseline 보존과 patch 관리

* `vendor/jit/jit.2.0.1.js`: **원본과 바이트 동일**하게 보존. 절대 직접 수정하지 않는다.
* `vendor/jit/LICENSE`: MIT 전문.
* `vendor/jit/MANIFEST.json`: 원본 SHA-256, git blob, upstream URL, 다운로드 시점, patch 목록 hash.
* `vendor/jit/patches/0001-hidpi.patch` … `0004-label-textcontent.patch`.
* `scripts/build-jit.mjs`: baseline 복사 → `git apply`로 patch 적용 → `dist/vendor/jit.v2.js` 생성. 빌드 산출물은 커밋하지 않거나, 커밋 시 manifest에 hash를 기록한다.
* CI에서 `git apply --check`와 patched file hash를 검증한다.
* **patch 총 변경량이 400줄을 넘거나 ST layout 함수를 건드려야 하면 중단**하고 아키텍처 재검토로 돌린다. 이는 “조용한 fork”를 막는 guard다.

### 4.3 최소 patch 4개

|Patch|문제|변경|검증|
|-|-|-|-|
|`0001-hidpi`|canvas backing store = CSS px (`3135-3145`, `3169-3177`)|`createCanvas`/`resize`에서 `dpr = min(devicePixelRatio, 2)`, backing store = `css \\\\\\\* dpr`, `ctx.setTransform(dpr,0,0,dpr,0,0)`, `getSize`는 CSS px 반환. `clear` 좌표 보정|1x/2x/3x screenshot, label/canvas 정렬, resize 후 재적용|
|`0002-dispose`|dispose 없음, scroll listener/timer 누수 (`2853-2859`, `869-876`)|`MouseEventsManager`가 listener 제거 함수를 보관. `Canvas`가 scroll listener 핸들 보관. `ST.prototype.dispose()`가 animation/group timer 정지, listener 제거, label DOM 제거, graph 참조 null|50회 mount/unmount 후 DOM node 수/타이머 수/`performance.memory` 안정|
|`0003-hit-test-visible`|`getNode`가 `drawn/exist` 무시 (`2102-2108`)|후보 loop에서 `drawn` 또는 `exist`가 false인 node를 skip. edge도 동일|숨은 노드 좌표 클릭이 선택되지 않음, visible 노드는 정상|
|`0004-label-textcontent`|`NodeDim`/demo가 `innerHTML = name` (`8383`, `1600`, `13012`)|`NodeDim.compute`의 `innerHTML`을 `textContent`로. adapter의 `onCreateLabel`도 `textContent`만 사용|`<img onerror>` 파일명이 DOM injection을 만들지 않음|

선택 사항(초기 아님): `0005-raf`로 `setInterval`을 rAF로 교체. bounded graph에서 이득이 측정될 때만 한다.

### 4.4 모듈 경계

```text
src/
  app/        route/shell/composition (React)
  domain/     TreeModel, SearchIndex, Selection, Navigation (DOM 없음)
  platform/   FileSourceAdapter 인터페이스 + desktop/android/ios/web 구현
  viz/        VisualizationAdapter + jit/ (projection, mount, input, fit)
  preview/    type resolution, renderers, sanitization, cleanup
  ui/         accessible tree/list, toolbar, breadcrumbs, preview pane
  native/     Tauri invoke 래퍼, error mapping
src-tauri/
  src/files/  desktop scanner, commands, path containment
  plugins/visual-directory-files/
              Rust command surface + Android Kotlin + iOS Swift
vendor/jit/   baseline, patches, license, manifest
tests/        unit, contract, visual, e2e, perf, fixtures
```

의존 규칙:

* `domain`은 `viz`, `platform`, `ui`를 import하지 않는다.
* `viz`는 `platform`을 import하지 않는다. `VizSnapshot`만 받는다.
* `preview`는 `FileSourceAdapter` 인터페이스에만 의존한다.
* `app`만 구현체를 조립한다.
* 네이티브 경로/URI는 `platform` 밖으로 새지 않는다.

### 4.5 파일 시스템 데이터와 시각화 데이터 분리

* `DirectoryEntry`는 `EntryId`, `name`, `kind`, `size`, `mimeHint`, `flags`만 가진다.
* `PlatformLocator`는 `FileSourceAdapter` 내부 map에만 존재한다.
* `VizSnapshot`은 `vd-` prefix의 시각화 ID, 표시 이름, kind, icon key, badge, parent, order, `hasMore`만 가진다.
* JIT `Graph.Node.id`는 `vd-` ID만 받는다. 실제 경로/URI/파일명을 ID로 쓰지 않는다.
* label DOM id도 `vd-` ID를 쓰므로 `tag.id = node.id`가 안전하다.
* 파일명은 **표시 데이터**이며, `textContent`로만 삽입한다.

### 4.6 Layout / rendering / interaction / navigation 분리

|계층|책임|JIT 의존|
|-|-|-|
|`TreeModel`|children cache, expansion, scan 상태, entry metadata|없음|
|`ProjectionBuilder`|visible subtree/window, `more` node, `VizSnapshot`|없음|
|`JitTreeView`|ST 생성/plot, 좌표, focus animation, fit/zoom|있음|
|`InputController`|pointer/touch/keyboard, tap vs drag, pinch|없음 (JIT Events 비활성)|
|`NavigationController`|root/back/breadcrumb/search focus|없음|
|`PreviewService`|type resolution, read, render, cleanup|없음|

### 4.7 TypeScript 전략

* 앱과 adapter는 strict TypeScript.
* `src/viz/jit/jit.d.ts`는 **사용하는 표면만** 선언한다: `JitST`, `JitConfig`, `JitNode`, `JitGraph`, `JitCanvas`, `JitViz`, `JitLabel`. upstream 전체 타입을 만들지 않는다.
* 런타임 guard: mount 시 `window.$jit?.version === '2.0.1'`, `typeof $jit.ST === 'function'`, `Canvas` 존재를 확인하고, 실패하면 명시적 오류로 중단한다.
* domain에는 `any`를 허용하지 않는다. JIT 경계에서만 unknown → narrowing.
* `Loader.loadJSON` 입력은 `VizSnapshot`에서만 생성하며, raw `DirectoryEntry`를 직접 넣지 않는다.

### 4.8 Pointer/touch, resize, high-DPI

* JIT `Events.enable=false`, `Navigation.enable=false`로 두고 입력은 adapter가 소유한다.
* HTML label이 node 사각형 전체를 덮도록 CSS를 구성해 **label click = node 선택** (O(1)). label이 없는 background 클릭은 adapter의 grid spatial index로 hit test.
* `touch-action: none`을 canvas wrapper에 적용하고, Pointer Events로 pan/pinch를 구현한다. `preventDefault`는 adapter에서만 호출한다.
* tap threshold: 8 CSS px / 300ms. drag 시작 시 label click 억제.
* wheel: `ctrlKey`면 zoom, 아니면 pan(옵션). trackpad pinch는 `wheel + ctrlKey`로 들어오는 경우를 처리.
* resize: `ResizeObserver`로 container 크기 변경 → `canvas.resize(cssW, cssH)` + `viz.refresh()`. DPR 변경은 `matchMedia('(resolution: …)')`로 감지.
* fit-to-view: drawn node의 `pos` bounds를 계산해 `canvas.setZoom` + `translate`로 맞춘다. JIT에 fit API가 없으므로 adapter가 구현한다.
* keyboard: `Tab`으로 toolbar/list, `Arrow`로 tree 탐색, `Enter`로 expand/preview, `Backspace`로 back, `Home`으로 root, `/`로 search focus, `Escape`로 preview/검색 닫기. canvas는 `aria-hidden`이고, keyboard는 parallel list/tree가 담당한다.

### 4.9 Custom file icon과 읽기 쉬운 label

* HTML label 구조:

```html
  <div class="vd-node vd-node--folder" data-entry-id="vd-…">
    <span class="vd-node\\\\\\\_\\\\\\\_icon" aria-hidden="true"></span>
    <span class="vd-node\\\\\\\_\\\\\\\_name" dir="auto"></span>
    <span class="vd-node\\\\\\\_\\\\\\\_badge"></span>
  </div>
  ```

* icon은 inline SVG sprite 또는 CSS mask. 파일명은 `textContent`.
* icon key는 `folder`, `pdf`, `text`, `markdown`, `image`, `archive`, `generic`으로 시작한다. 확장자→icon mapping은 presentation-only이며 보안/type 판정에 쓰지 않는다.
* 긴 이름은 CSS `text-overflow: ellipsis`, 2줄 옵션, tooltip/ARIA label에 full name.
* folder는 아이콘 + 굵기 + 펼침 표시(chevron)로 구분하고, 색만으로 구분하지 않는다.
* label width는 `ctx.measureText`로 미리 계산해 cache. `NodeDim.autoWidth`는 사용하지 않는다(숨은 DOM 측정 비용과 `innerHTML` 경로 회피).
* visible label ≤ 500개. 그 이상은 Native canvas label 또는 label 숨김 + list view.

### 4.10 Incremental update와 bounded rendering

JIT graph에는 **현재 viewport에 필요한 projection만** 넣는다.

* `maxDepth = 3` (focus 기준)
* `maxNodes = 1,500`
* `maxChildrenPerFolder = 200`
* `maxLabels = 500`
* `maxMoreNodes = 50`

정책:

1. folder를 펼치면 children을 lazy load하고 projection을 다시 만든다.
2. 작은 delta(≤300 nodes)는 `op.morph`로 유지/애니메이션.
3. 큰 delta는 `loadJSON` + `select`로 재구성(애니메이션 생략)하고 “재구성 중” 상태를 표시.
4. 200개를 넘는 children은 `more` node(`… 1,234 more`)로 묶고, 클릭 시 다음 page를 load하거나 list view로 전환.
5. 검색 결과/큰 folder는 graph 대신 **virtualized list view**를 기본으로 제공.
6. `drawn/exist`는 projection과 일치시킨다. collapse 시 graph에서 제거하거나 `exist=false`로 두되 hit test에서 제외한다.
7. **검색:** `SearchIndex` worker가 filename을 NFC/NFKC 정규화 + case-fold 후 substring/prefix로 찾는다. 결과 선택 시 ancestor를 expand하고 focus한다. 결과가 많으면 graph 대신 virtualized result list를 사용한다.
8. **접근성/대형 folder 대안:** graph와 동일한 selection/expansion을 공유하는 virtualized ARIA tree/list를 항상 제공한다. graph는 visual affordance이고, list는 keyboard/screen reader의 primary path다.

### 4.11 Disposal

`JitTreeView.destroy()` 순서:

1. 진행 중 animation/group timer 정지 (`dispose` patch)
2. `AbortController.abort()` (scan/preview)
3. `ResizeObserver.disconnect()`
4. label DOM 제거, object URL revoke, temp file 삭제
5. canvas wrapper 제거, `viz = null`, `graph = null`
6. 이벤트 리스너 제거 확인

검증: 50회 mount/unmount 후 `document.querySelectorAll('.vd-node').length === 0`, 타이머/리스너 증가 없음, `performance.memory`(Chromium) 안정. iOS/Android는 Instruments/Profiler로 별도 확인.

### 4.12 Regression protection

* **Visual baseline:** 고정 viewport/DPR/font에서 20-node, 200-node, 1,500-node ST를 캡처. patched vs unpatched는 DPR 차이만 허용하고 layout 좌표는 동일해야 한다.
* **Behavior tests:** click → focus, collapse → children hidden, back → previous focus, fit → all visible, resize → re-center.
* **Security tests:** `<img src=x onerror=…>.txt`, RTL/emoji/combining, 255-byte name, `..`, NUL, control chars.
* **Performance fixtures:** §8.5.
* **Patch drift test:** `git apply --check` + patched hash.

### 4.13 명시적 호환성 break와 migration

|Break|이유|Migration|
|-|-|-|
|`$jit`를 ESM `import`하지 않음|IIFE/global 전제 (`38`)|classic `<script>` 또는 `?url` + runtime inject. bundler strict wrapper 금지|
|raw 파일명을 node id로 사용 금지|중복/특수문자/DOM id/XSS|`vd-` ID mapping|
|`NodeDim.autoWidth` 미사용|DOM 측정 비용 + `innerHTML`|`ctx.measureText` + fixed width|
|JIT `Events`/`Navigation` 미사용|hit test/터치 한계|adapter input layer|
|`levelsToShow`만으로 렌더 수를 제한하지 않음|wide folder 폭발|projection window + list view|
|ST hidden node를 유지하지 않음|메모리/정확성|projection 재구성|

### 4.14 추상화하지 않을 것

* 범용 graph engine abstraction을 만들지 않는다. 요구는 folder tree 하나다.
* 두 번째 시각화 라이브러리를 추가하지 않는다. JIT이 요구를 못 맞추면 별도 의사결정 문서가 필요하다.
* plugin system, theme engine, layout registry는 concrete requirement가 생길 때만.
* JIT wrapper에 모든 옵션을 노출하지 않는다. 필요한 옵션만 타입화한다.

\---

## 5\. Cross-platform 아키텍처 결정

### 5.1 후보

|기준|A. Tauri 2 (all targets)|B. Electron + Capacitor|C. Tauri desktop + Capacitor mobile|D. PWA only|
|-|-|-|-|-|
|jit.js/UI 재사용|5/5|5/5|5/5|5/5|
|Desktop folder access|5/5|5/5|5/5|2/5 (Chromium only)|
|Mobile folder access|2/5 (custom plugin)|3/5 (plugin + custom enumeration)|3/5|1/5|
|External open|5/5 desktop, 2/5 mobile|5/5 desktop, 4/5 mobile|5/5 desktop, 4/5 mobile|1/5|
|Native plugin 부담|중간 (Rust+Kotlin+Swift)|중간\~높음 (2 ecosystems)|중간|낮음|
|Mobile sandbox|2/5|3/5|3/5|1/5|
|Rendering consistency|3/5 (system WebView)|4/5 desktop Chromium, 3/5 mobile|3\~4/5|4/5|
|Packaging/signing|4/5 (one pipeline)|2/5 (two pipelines)|3/5|5/5|
|Tooling (Windows/macOS/Apple)|Rust + Visual Studio Build Tools + Xcode(macOS) + Android Studio|Node + Electron builder + Xcode + Android Studio + Capacitor|양쪽 toolchain|Node only|
|Distribution|MSI/NSIS, DMG/notarize, AAB, IPA|같은 4종 + 2개 pipeline|같은 4종 + 2개 shell|web hosting/PWA|
|Maintenance|4/5|2/5|3/5|3/5|

> 점수는 “공식 plugin만 사용했을 때” 기준이다. mobile custom plugin을 구현하면 A/B 모두 mobile folder access가 4/5 수준으로 올라가지만, 구현·유지 비용은 A가 한 벌, B가 두 벌이다.

### 5.2 공식 문서로 확인한 현재 제약

**Tauri 2 (CLI 2.12.4, `tauri` crate 2.12.5 기준)**

* Dialog plugin: Android/iOS는 **folder picker 미지원**.
* File System plugin: Android/iOS는 **Application folder로 접근 제한**.
* Opener plugin: Android/iOS는 **URL만 open** (file open 미지원).
* Persisted Scope plugin은 전 플랫폼을 지원하지만, 이는 Tauri fs scope 저장이며 Android SAF grant나 macOS security-scoped bookmark를 대신하지 않는다. **\[Deduced]** 공개 API에서 bookmark/SAF grant 노출은 확인하지 못했다.
* 모바일 plugin은 Kotlin/Swift로 작성하고 Rust command와 연결할 수 있다.
* 따라서 **모바일 folder 선택, children enumeration, file read, external open/share는 custom plugin이 필요**하다.

**Electron 45**

* `dialog.showOpenDialog({ properties: \\\\\\\['openDirectory'] })` 지원.
* macOS MAS에서 `securityScopedBookmarks: true`로 bookmark 반환.
* `shell.openPath`로 기본 앱 열기.
* 모바일 target 없음.

**Capacitor 8.5.3**

* Filesystem은 `file://` 및 Android `content://` 읽기를 지원하지만, **SAF tree enumeration API는 아니다**. Android 11+에서 `Directory.Documents`는 앱이 만든 파일로 제한.
* `@capawesome/capacitor-file-picker`의 `pickDirectory()`는 Android/iOS에서 path를 반환하고 iOS는 security-scoped bookmark를 제공. 그러나 recursive enumeration은 별도 구현이 필요.
* `@capacitor/file-viewer`는 native Android/iOS에서 문서 열기를 제공.
* iOS는 Xcode 26+, Android는 Android Studio 2025.2.1+, API 24+.

**공통**

* iOS 배포는 macOS/Xcode와 Apple Developer program이 필요하다. Apple은 연 $99.
* Android는 keystore와 Play App Signing이 필요하다.
* JIT은 system WebView에서 실행되므로 WKWebView/Android WebView 성능을 실제 기기에서 측정해야 한다.

### 5.3 권장안

**A. Tauri 2 단일 코드베이스**를 권장한다.

이유:

1. 데스크톱과 모바일이 **하나의 Rust command surface + 하나의 JS adapter contract**를 공유한다.
2. 모바일에서 어차피 custom native code가 필요하므로, “Tauri라서 plugin을 새로 써야 한다”는 단점은 B안에도 동일하게 존재한다. B안은 그 위에 shell/IPC가 두 벌이 된다.
3. Rust scanner는 desktop에서 대량 entry enumeration, cancellation, path containment를 main thread 밖에서 처리하기 좋다.
4. Tauri는 **raw bytes IPC (`tauri::ipc::Response`)** 로 preview data를 전달할 수 있다. custom URI/protocol을 피하는 초기 구현이 가장 단순하다. 단, mobile plugin에서 이 반환 경로가 실제로 동작하는지는 Phase 4 spike에서 확인한다. **\[Unverified]**
5. 배포 파이프라인이 하나라 Windows/macOS/Android/iOS release gate를 한 곳에서 관리할 수 있다.

**Fallback: B. Electron + Capacitor.** Tauri mobile spike가 아래 중 하나라도 실패하면 전환한다.

* SAF tree enumeration + persisted grant가 안정적으로 동작하지 않음
* iOS security-scoped bookmark/open-in-place가 provider 전반에서 불안정
* WKWebView에서 800 visible nodes가 30fps를 지속하지 못함
* Tauri mobile plugin의 build/debug 비용이 일정의 30%를 초과

Fallback에서도 **web UI, domain, viz adapter, preview renderers는 100% 재사용**한다. Electron main process와 Capacitor plugin만 교체한다.

\*\*C안(Tauri desktop + Capacitor mobile)\*\*은 “Tauri mobile만 실패”한 경우의 contingency다. 데스크톱 투자를 보존하지만, 두 shell을 유지해야 하므로 primary로 선택하지 않는다.

\*\*D안(PWA)\*\*은 optional browser edition으로만 둔다. `showDirectoryPicker`는 desktop Chromium 계열(Windows/macOS/Linux/ChromeOS)에서 동작하고 Safari/Firefox에는 없다. Chrome for Android는 caniuse 기준 미지원으로 표시되어 있으므로 **desktop Chromium으로 범위를 한정해 검증**한다. directory handle permission도 세션마다 재요청될 수 있어 native와 parity를 주장하지 않는다.

### 5.4 공유 코드 vs 플랫폼별 adapter

|영역|공유|Windows|macOS|Android|iOS/iPadOS|
|-|-|-|-|-|-|
|UI/domain/viz/preview|✅ TS|WebView2|WKWebView|Android WebView|WKWebView|
|Folder picker|contract만|Tauri dialog (folder)|Tauri dialog|Kotlin `ACTION\\\\\\\_OPEN\\\\\\\_DOCUMENT\\\\\\\_TREE`|Swift `UIDocumentPickerViewController` (folder)|
|Enumeration|contract만|Rust `std::fs`|Rust `std::fs`|Kotlin `DocumentsContract`|Swift `FileManager` + coordinator|
|Permission persistence|contract만|path 재검증|path / bookmark (MAS)|`takePersistableUriPermission`|security-scoped bookmark|
|External open|contract만|opener `open\\\\\\\_path`|NSWorkspace/opener|`ACTION\\\\\\\_VIEW` + grant|`UIDocumentInteractionController`/share|
|Preview bytes|renderer 공유|Rust read|Rust read|Kotlin `ContentResolver`|Swift coordinated read|
|Packaging|공통 설정|MSI/NSIS|DMG/notarization|AAB|IPA/App Store|

### 5.5 Tooling / signing

* **Windows:** Node 22+, Rust 1.90+, WebView2 (Windows 11 기본, 그 이전은 installer가 설치), Visual Studio Build Tools, code signing certificate.
* **macOS:** macOS + Xcode, Apple Developer, Developer ID/notarization. iOS build는 macOS 필수.
* **Android:** Android Studio, SDK API 36 target, JDK (Studio 내장), NDK (Tauri), keystore.
* **iOS:** Xcode 26+ (Capacitor 8 기준), provisioning profile, privacy manifest.
* **CI:** Windows runner(desktop build/test), macOS runner(iOS/macOS sign/notarize), Ubuntu runner(Android build + JS tests). 서명 secret은 release workflow에만 둔다.

\---

## 6\. Platform capability matrix (플랫폼 기능 비교)

|항목|Windows|macOS|Android|iOS/iPadOS|Browser (optional)|
|-|-|-|-|-|-|
|Folder 선택|`IFileOpenDialog` folder (Tauri dialog)|`NSOpenPanel` canChooseDirectories|SAF `ACTION\\\\\\\_OPEN\\\\\\\_DOCUMENT\\\\\\\_TREE`|`UIDocumentPicker` for `.folder`, `asCopy:false`|`showDirectoryPicker()` (desktop Chromium); `<input webkitdirectory>` fallback|
|권한 범위|NTFS ACL, 사용자 계정|POSIX/TCC, sandbox면 security-scoped bookmark|tree URI grant (read-only)|security-scoped URL + bookmark|handle 단위, origin 단위|
|지속성|없음. path 저장 후 재검증|비sandbox: path. MAS: bookmark|`takePersistableUriPermission`|bookmark (`withSecurityScope`)|IndexedDB handle + 재요청. Chrome 122+ persistent option|
|Entry 식별|volume serial + file ID + relative path (가능 시), fallback canonical path|file resource ID + relative path|tree URI + `documentId`|provider item ID/file resource ID + relative path|handle + relative path|
|Enumeration|Lazy `read\\\\\\\_dir`|Lazy `read\\\\\\\_dir`|`DocumentsContract` child query, cursor|`contentsOfDirectory` + `NSFileCoordinator`|async iterator, lazy|
|재시작 후|path 존재/ACL 재확인. 실패 시 재선택|bookmark resolve/stale 처리 또는 path|persisted URI 재확인. 실패 시 재선택|bookmark resolve + `startAccessing…`|`requestPermission()` on gesture. 실패 시 재선택|
|철회/제공자 소실|entry별 `AccessDenied`, partial tree|TCC/권한 변경, stale bookmark|`SecurityException`, provider offline|provider 제거/오프라인, coordinated read 실패|`NotAllowedError`, handle 무효|
|External open|`ShellExecute`/opener|`NSWorkspace`/opener|`ACTION\\\\\\\_VIEW` + `FLAG\\\\\\\_GRANT\\\\\\\_READ\\\\\\\_URI\\\\\\\_PERMISSION`|`UIDocumentInteractionController`/QuickLook|download/new tab, Web Share|
|Share|선택(추후)|`NSSharingService`(추후)|`ACTION\\\\\\\_SEND` chooser|`UIActivityViewController`|Web Share API (지원 시)|
|남는 제한|long path, junction/reparse, OneDrive placeholder, locked file|iCloud eviction, APFS case-insensitivity, NFD, TCC 폴더|SAF root/Download/Android/data/obb 선택 불가, provider 편차, path 없음|임의 path 접근 불가, provider별 open-in-place, iCloud 다운로드 지연|Safari/Firefox directory handle 없음, path 없음, 대용량 복사|

### 6.1 플랫폼별 설계 메모

**Windows**

* picker는 folder path를 반환한다. 사용자가 선택한 폴더 자체는 ACL상 읽을 수 있어야 한다.
* junction/symlink는 기본적으로 **follow하지 않는다.** 표시만 하고, 사용자가 “따라가기”를 선택할 때만 containment 검사 + ancestor `(volumeId, fileId)` set으로 cycle을 차단한 뒤 진입한다.
* long path는 `\\\\\\\\\\\\\\\\?\\\\\\\\` prefix 또는 Rust의 long-path-aware API로 처리한다. 260자 제한 테스트를 fixture에 포함한다.
* OneDrive placeholder는 `FILE\\\\\\\_ATTRIBUTE\\\\\\\_RECALL\\\\\\\_ON\\\\\\\_DATA\\\\\\\_ACCESS`/offline attribute를 badge로 표시하고, preview read 전에 사용자 확인을 받는다.
* `ShellExecute`/opener는 파일명을 shell string으로 조립하지 않고 path API에 직접 전달한다.

**macOS**

* 비sandbox(DMG 배포)에서는 path 기반 접근이 단순하다. TCC가 보호하는 Desktop/Documents/Downloads는 사용자가 picker로 선택하면 접근이 부여된다.
* Mac App Store는 sandbox + security-scoped bookmark가 필요하다. Tauri의 공개 plugin API에서 bookmark 노출을 확인하지 못했으므로 **MAS는 V1 범위에서 제외**하고, 필요 시 custom Swift/ObjC bookmark plugin을 추가한다. **\[Deduced/Unverified]**
* APFS는 기본 case-insensitive지만 case-preserving이다. 이름 비교로 entry를 식별하지 않는다.
* HFS+ 유래 NFD 이름과 APFS NFC 이름이 섞일 수 있다. 검색은 NFC/NFKC 정규화 후 비교하고, 표시는 원본을 유지한다.
* iCloud eviction 상태를 표시하고, read 시 다운로드가 발생할 수 있음을 알린다.

**Android**

* `ACTION\\\\\\\_OPEN\\\\\\\_DOCUMENT\\\\\\\_TREE` + `takePersistableUriPermission(uri, FLAG\\\\\\\_GRANT\\\\\\\_READ\\\\\\\_URI\\\\\\\_PERMISSION)`.
* `DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId)`로 children을 query한다. `COLUMN\\\\\\\_DOCUMENT\\\\\\\_ID`, `DISPLAY\\\\\\\_NAME`, `MIME\\\\\\\_TYPE`, `SIZE`, `LAST\\\\\\\_MODIFIED`를 사용하되 null/미지원 column을 허용한다.
* `documentId`는 provider-scoped이므로 `treeUri + documentId`를 locator로 쓴다.
* Android 11+에서 internal storage root, Download, `Android/data`, `Android/obb`는 SAF로 선택할 수 없다. UI에서 사전 안내한다.
* provider가 cloud/virtual file이면 `openFileDescriptor`가 지연/실패할 수 있다. `CancellationSignal`과 timeout을 둔다.
* 외부 열기는 `ACTION\\\\\\\_VIEW`에 URI와 read grant를 붙인다. handler가 없으면 `ActivityNotFoundException` → `ACTION\\\\\\\_SEND` chooser.
* 앱 전용 파일만 `FileProvider`를 쓰고, SAF URI에는 직접 grant를 준다.

**iOS/iPadOS**

* `UIDocumentPickerViewController(forOpeningContentTypes: \\\\\\\[.folder], asCopy: false)`.
* delegate에서 `startAccessingSecurityScopedResource()`를 호출하고, URL을 사용하는 동안 유지한다. 사용 후 `stopAccessing…`.
* 재시작 후에는 `bookmarkData(options: .withSecurityScope, …)`를 저장하고, resolve 시 `isStale`을 처리한다. stale이면 새 bookmark를 만들거나 재선택을 요청한다.
* `FileManager.contentsOfDirectory(at:includingPropertiesForKeys:)`로 lazy enumerate. cloud file은 `NSFileCoordinator`로 coordinated read.
* 폴더 선택이 provider에 따라 **copy**로 동작할 수 있다. “원본 접근”과 “가져온 복사본”을 UI에서 구분하고, 복사본이면 원본 변경이 반영되지 않음을 알린다.
* 외부 열기는 `UIDocumentInteractionController`/`QLPreviewController`/`UIActivityViewController`를 사용한다. security-scoped URL을 다른 앱에 직접 넘기지 못하는 경우가 있으므로, 필요 시 임시 복사 후 share한다(임시 파일은 즉시 정리).
* iPad는 hardware keyboard/pointer를 지원한다.

**Browser (optional)**

* Chromium desktop(Windows/macOS/Linux/ChromeOS): `showDirectoryPicker({ mode:'read' })`, `for await (const \\\\\\\[name, handle] of dir.entries())`, `getFile()`. Chrome for Android는 caniuse 기준 `showDirectoryPicker` 미지원으로 표시되어 있어, browser edition은 desktop Chromium으로 한정해 검증한다.
* handle은 IndexedDB에 저장 가능하지만 permission은 세션/사용자 선택에 따라 재요청. Chrome 122+에서 persistent permission 옵션이 있으나 보장하지 않는다.
* Safari/Firefox: `webkitdirectory` input으로 **한 번의 snapshot**만 가능. directory handle/lazy read/persistence 없음. 대용량은 OPFS에 복사해야 하며, “원본 접근”이 아니다.
* 외부 열기/공유는 browser download/Web Share로 제한된다. native와 parity를 주장하지 않는다.

\---

## 7\. 파일 미리보기 / 외부 열기 matrix

### 7.1 Type resolution 정책

1. **Magic bytes**를 우선한다.

   * PDF: `%PDF-`
   * PNG/JPEG/GIF/WebP/AVIF: signature
   * SVG: BOM/whitespace 제거 후 `<svg`
2. extension은 hint로만 사용한다.
3. platform MIME은 hint로만 사용한다.
4. 셋이 충돌하면 **감지된 type으로 렌더**하고, 확장자 불일치를 badge로 표시한다.
5. 감지 실패 시 extension mapping → `application/octet-stream` → Unsupported.
6. 절대 extension만 믿고 실행/렌더하지 않는다.

### 7.2 Matrix (동작 비교)

|Type|Windows|macOS|Android|iOS/iPadOS|Browser|
|-|-|-|-|-|-|
|**PDF**|기본: 내부 pdf.js. 실패/대형: 기본 앱 열기|동일|기본: 내부 pdf.js(≤20MB/150p). 초과/실패: `ACTION\\\\\\\_VIEW`|기본: 내부 pdf.js(≤20MB/150p) 또는 QuickLook spike. 초과: share/Open in…|내부 pdf.js, 실패 시 다운로드|
|**TXT**|내부 text viewer (encoding detect, ≤2MB)|동일|내부 (≤2MB)|내부 (≤2MB)|내부 (≤2MB)|
|**Markdown**|내부 sanitized render (≤1MB)|동일|내부 (≤1MB)|내부 (≤1MB)|내부 (≤1MB)|
|**Images**|내부 (JPEG/PNG/WebP/GIF/AVIF/SVG; ≤40MB, ≤80MP)|동일 + HEIC는 OS 디코더/QuickLook|내부 (≤25MB; HEIC는 기기 디코더 확인)|내부 (≤25MB; HEIC native)|내부 (≤25MB; HEIC는 브라우저별 지원 차이, 실패 시 external)|
|**Unsupported**|내부 없음. “Open with default app” / “Reveal”|“Open With” / Finder|`ACTION\\\\\\\_VIEW`, 없으면 share|share/“Open in…”|다운로드/공유|

### 7.3 동작과 fallback

* **기본 click:** folder면 expand/focus, file이면 preview 시도.
* **내부 preview 실패:** 오류를 보여주고 “Open externally”/“Share”를 명확히 제공.
* **handler 없음:** Android `ActivityNotFoundException`, Windows `shell.openPath` error, macOS `NSWorkspace` false, iOS share sheet. 각각 사용자 메시지와 copy 가능한 경로/이름을 제공.
* **권한 철회/파일 삭제:** preview를 닫고 “다시 선택”/“새로고침” 제공.
* **로딩:** skeleton + cancel. 300ms 이상이면 progress, 5s 이상이면 external fallback 제안.
* **크기 초과:** 읽지 않고 metadata + external action.

### 7.4 제한과 오류 처리

|항목|제한/정책|오류|
|-|-|-|
|Text|file ≤2MiB, 20,000 lines, encoding detect|`decode-failed` → encoding 선택|
|Markdown|≤1MiB, raw HTML off, remote image off|`render-failed` → source text fallback|
|Image|≤40MB, ≤80MP, downscale 4096px|`decode-failed`/`too-large`|
|PDF|desktop ≤50MB/500p, mobile ≤20MB/150p|`too-large`/`render-failed` → external|
|Unsupported|no read|`unsupported` + external/share|
|Temp file|TTL ≤10min, 삭제 보장|정리 실패 시 앱 재시작 시 sweep|

### 7.5 보안 규칙

* **파일명으로 shell command를 만들지 않는다.** `open\\\\\\\_path`, `ACTION\\\\\\\_VIEW`, `UIDocumentInteractionController`만 사용한다.
* 네이티브 경계는 `grantId + entryId`만 받고, JS에서 raw path/URI를 받지 않는다.
* path 기반 플랫폼은 canonicalize 후 root prefix 검사. `..`, symlink escape, reparse point를 거부한다.
* Android는 provider가 grant한 tree 밖의 `documentId`를 거부한다.
* iOS는 standardized URL이 root URL prefix 안인지 확인한다.
* Markdown: `html:false`, DOMPurify, `javascript:`/`data:` link 차단, remote image 기본 차단, `rel="noopener noreferrer"`.
* PDF: pdf.js `isEvalSupported:false`, XFA 비활성, remote resource 차단, worker sandbox, CSP.
* SVG: `<img>`로만 렌더, inline script 금지, CSP `img-src 'self' blob:`; 의심 시 external.
* Text: NUL/control char 제거, HTML escape, DOM line virtualization.
* Object URL/temp file은 preview 종료/전환 시 즉시 정리.
* Android `ACTION\\\\\\\_VIEW`의 read grant는 Intent 수명에 한정하고, iOS security-scoped access는 사용 후 `stopAccessing…`한다. 임시 복사본은 TTL을 두고 즉시 삭제한다.
* filename은 `textContent`만. `innerHTML` 금지(린트 규칙으로 차단).

\---

## 8\. Interfaces, data flow, benchmark (인터페이스·데이터 흐름·벤치마크)

### 8.1 Contract sketches

```ts
// platform/FileSourceAdapter.ts
export type EntryId = string \\\\\\\& { readonly \\\\\\\_\\\\\\\_brand: 'EntryId' };
export type EntryKind = 'folder' | 'file';
export type Platform = 'windows' | 'macos' | 'android' | 'ios' | 'web';

export type PlatformLocator =
  | { kind: 'path'; path: string; volumeId?: string; fileId?: string }
  | { kind: 'android-document'; treeUri: string; documentId: string }
  | { kind: 'ios-url'; bookmarkId: string; relativePath: string }
  | { kind: 'web-handle'; rootKey: string; relativePath: string\\\\\\\[] };

export interface DirectoryEntry {
  id: EntryId;                 // session-scoped, opaque
  parentId: EntryId | null;
  name: string;                // untrusted display text
  kind: EntryKind;
  size?: number;
  mimeHint?: string;
  modifiedAt?: number;
  childCount?: number;
  flags: {
    hidden?: boolean;
    symlink?: boolean;
    cloudOnly?: boolean;
    readable?: boolean;
  };
}

export interface RootGrant {
  grantId: string;             // native capability, not a path
  root: DirectoryEntry;
  displayPath: string;         // breadcrumb only
  persisted: boolean;
}

export interface ListOptions {
  cursor?: string;
  limit: number;               // page size, e.g. 200
  includeHidden?: boolean;
  signal: AbortSignal;
}

export interface ListPage {
  entries: DirectoryEntry\\\\\\\[];
  nextCursor?: string;
  partial: boolean;
  errors: FileAccessError\\\\\\\[];
}

export interface EntryStat {
  size?: number;
  modifiedAt?: number;
  mimeHint?: string;
  readable: boolean;
}

export interface ShareResult {
  ok: boolean;
  code?: 'no-handler' | 'cancelled';
}

export interface FileSourceAdapter {
  readonly platform: Platform;
  pickFolder(): Promise<RootGrant | null>;
  restore(grantId: string, signal: AbortSignal): Promise<RootGrant | null>;
  listChildren(parent: EntryId, opts: ListOptions): Promise<ListPage>;
  stat(entry: EntryId): Promise<EntryStat>;
  readBytes(entry: EntryId, maxBytes: number, signal: AbortSignal): Promise<Uint8Array>;
  /\\\\\\\*\\\\\\\* optional: native preview/open; never a shell string \\\\\\\*/
  open(entry: EntryId): Promise<OpenResult>;
  share?(entry: EntryId): Promise<ShareResult>;
  close(): Promise<void>;
}

export type FileAccessErrorCode =
  | 'permission-denied' | 'stale-grant' | 'not-found'
  | 'provider-unavailable' | 'too-large' | 'unsupported'
  | 'decode-failed' | 'render-failed' | 'cancelled' | 'io-error';

export interface FileAccessError {
  code: FileAccessErrorCode;
  entryId?: EntryId;
  recoverable: boolean;
  messageKey: string;
  cause?: unknown;
}

export type OpenResult =
  | { ok: true }
  | { ok: false; code: 'no-handler' | 'permission-denied' | 'not-found' };
```

```ts
// domain/TreeModel.ts
export interface TreeNode {
  entry: DirectoryEntry;
  state: 'unloaded' | 'loading' | 'loaded' | 'error';
  expanded: boolean;
  children: EntryId\\\\\\\[];         // ordered display order
  error?: FileAccessError;
}

export interface SearchHit {
  entry: DirectoryEntry;
  score: number;
}

export interface TreeModel {
  setRoot(grant: RootGrant): Promise<void>;
  loadChildren(id: EntryId, signal: AbortSignal, cursor?: string): Promise<void>;
  expand(id: EntryId): Promise<void>;
  collapse(id: EntryId): void;
  get(id: EntryId): TreeNode | undefined;
  search(query: string, limit: number): Promise<SearchHit\\\\\\\[]>;
  snapshot(policy: ProjectionPolicy): VizSnapshot;
  on(event: 'change' | 'error' | 'scan', cb: () => void): () => void;
}

export interface ProjectionPolicy {
  maxDepth: number;            // 3
  maxNodes: number;            // 1500
  maxChildrenPerFolder: number;// 200
  maxLabels: number;           // 500
  maxMoreNodes: number;        // 50
}

export interface VizSnapshot {
  rootVizId: string;
  focusVizId: string;
  nodes: Array<{
    vizId: string;             // /^vd-\\\\\\\[a-z0-9-]+$/
    parentVizId: string | null;
    name: string;
    kind: EntryKind;
    icon: string;
    badge?: 'cloud' | 'link' | 'more';
    childCount?: number;
    hasMore?: boolean;
    order: number;
  }>;
  truncated: boolean;
}
```

```ts
// viz/VisualizationAdapter.ts
export interface VisualizationAdapter {
  mount(host: HTMLElement, policy: ProjectionPolicy): Promise<void>;
  render(snapshot: VizSnapshot, opts?: { animate?: boolean }): Promise<void>;
  focus(entryId: EntryId, opts?: { animate?: boolean }): Promise<void>;
  fit(): void;
  zoomBy(factor: number): void;
  centerOn(entryId: EntryId): void;
  setOnActivate(cb: (entryId: EntryId) => void): void;
  resize(): void;
  destroy(): Promise<void>;
}
```

```ts
// preview/PreviewService.ts
export interface PreviewHandle {
  kind: 'text' | 'markdown' | 'image' | 'pdf' | 'unsupported';
  canOpenExternal: boolean;
  destroy(): Promise<void>;
}

export interface PreviewService {
  open(entry: DirectoryEntry, host: HTMLElement, signal: AbortSignal): Promise<PreviewHandle>;
  close(): Promise<void>;
}
```

```ts
// platform/ExternalOpenService.ts
export interface ExternalOpenService {
  open(entry: DirectoryEntry): Promise<OpenResult>;
  share?(entry: DirectoryEntry): Promise<{ ok: boolean; code?: string }>;
}
```

### 8.2 Ownership

|Concern|Owner|Persistence|Note|
|-|-|-|-|
|Navigation (root/focus/back stack)|`NavigationController`|session (recent roots optional)|JIT은 반영만|
|Selection|`TreeModel`/`SelectionStore`|session|preview가 subscribe|
|Expansion|`TreeModel`|session|projection을 결정|
|Permissions/grants|`FileSourceAdapter` + native|root locator/grant만|capability는 native|
|Scan/cancel|`FileSourceAdapter`|none|`AbortSignal` + native token|
|Viewport (pan/zoom)|`VisualizationAdapter`|session|저장하지 않음|
|Preview|`PreviewService`|none|single active, selection 변경 시 abort|
|Search index|`SearchIndex` (worker)|session|rescan 시 rebuild|
|Errors|`ErrorStore`|session|per-node + global|

### 8.3 Data flow

```text
\\\\\\\[User picks folder]
        │
        ▼
PlatformFileSource.pickFolder()
        │  RootGrant (grantId, root, displayPath)
        ▼
TreeModel.setRoot() ──► loadChildren(root) ──► ListPage
        │
        ▼
ProjectionBuilder.snapshot(policy) ──► VizSnapshot
        │
        ▼
JitTreeView.render() ──► JIT loadJSON / op.morph
        │
   click label (data-entry-id)
        ▼
NavigationController.activate(entryId)
   ├─ folder: TreeModel.expand() → new snapshot → render
   └─ file:   PreviewService.open() → readBytes() → renderer
                    │
                    └─ fail/unsupported → ExternalOpenService.open()/share()
```

### 8.4 Error model

* `FileAccessError`는 code, recoverable, entryId, messageKey를 가진다.
* UI는 한국어/영어 messageKey로 매핑하고, 기술 상세는 “자세히”에 숨긴다.
* partial tree: permission-denied child는 error badge + 재시도. 전체 root 실패만 global error.
* scan 후 rename/move/delete/change는 `not-found`/`permission-denied`/`io-error`로 매핑하고, 해당 node에 “새로고침”을 제공한다. stale entry를 다른 entry로 조용히 재사용하지 않는다.
* scan cancellation은 오류가 아니라 `cancelled` 상태로 표시하고, 이미 로드된 children은 유지한다.

### 8.5 Benchmark fixtures와 budget

|Fixture|구성|목적|
|-|-|-|
|`small`|root + 3 folders + 12 files|기본 동작/visual baseline|
|`deep`|2,000 nested chain|recursion/depth cap, list fallback|
|`wide`|10,000 files + 100 folders in one folder|windowing, search, memory|
|`large`|100,000 entries / 5,000 folders, 5% expanded|index vs rendered 분리|
|`unicode`|500 names: Korean, emoji, Arabic, combining, 255-byte|정렬/검색/ellipsis/RTL|
|`faults`|permission denied subtree, symlink cycle, 10% deleted during scan, cloud placeholders|오류/취소/partial|
|`mixed`|PDF/TXT/MD/JPEG/PNG/WebP/HEIC/SVG/unknown, 1KB–100MB|preview matrix|

|Metric|Target budget (측정 전)|Measurement|
|-|-|-|
|Time to first visible tree (200 children)|p50 ≤ 400ms, p95 ≤ 1,200ms|`performance.mark` from grant to first paint|
|Expand/collapse (200 children)|first frame ≤ 300ms; animation ≤ 350ms|marks + screenshot|
|Pan/zoom|desktop ≥ 50fps; mobile ≥ 30fps @ 800 visible nodes|DevTools trace / Instruments|
|Memory|desktop ≤ 300MB, mobile ≤ 200MB @ 100k indexed, no preview|`measureUserAgentSpecificMemory`/RSS|
|Cancellation|UI ack ≤ 100ms; native stop ≤ 250ms|mark + native log|
|Search|≤ 100ms for 100k names; first result ≤ 150ms|worker timing|
|Preview text 1MB|≤ 300ms|mark|
|Preview image 12MP|≤ 500ms|mark|
|Preview PDF first page|desktop ≤ 1.5s; mobile ≤ 2.5s|mark|
|Rendered nodes / labels|≤ 1,500 / ≤ 500|runtime assertion|
|Mount/unmount 50x|DOM/timer/listener baseline 복귀|test assertion|

**중요:** 이 수치는 target이며 아직 측정하지 않았다. “100k entries를 모두 렌더링”하지 않는다. **총 indexed entries와 실제 rendered nodes를 분리**한다.

\---

## 9\. Phased implementation plan (단계별 구현 계획)

> 일정은 1명 senior engineer + 0.5 designer 기준의 rough range다. 모바일 native 경험이 없으면 Phase 4/5에 native engineer를 추가한다. Phase 4는 아키텍처를 무효화할 수 있으므로 \\\\\\\*\\\\\\\*Phase 1과 병렬로 앞당기고, Phase 2 초반에 go/no-go를 둔다.\\\\\\\*\\\\\\\*

### Phase 0 — Local `jit.js` audit + REA feasibility

* **Objective:** JIT의 정체/기능/한계를 확정하고, 아키텍처 go/no-go 근거를 만든다.
* **Dependencies:** 없음.
* **Files:** `docs/VISUAL-DIRECTORY-V2-IMPLEMENTATION-PLAN.md`, `vendor/jit/MANIFEST.json`(다음 단계).
* **Deliverables:** 이 문서, hash/provenance 기록, capability matrix, REA NOT RUN 기록.
* **Acceptance:** upstream blob과 local hash 일치, license 확인, 최소 4개 hard gap 식별, REA 상태 명시.
* **Tests/evidence:** `Get-FileHash`, `git hash-object`, GitHub API, Node VM probe, 공식 docs.
* **Platform evidence:** Windows host, upstream GitHub API, Node VM. 실제 macOS/iOS/Android는 미수행.
* **Risks:** provenance 오판, “공식 2.0.1”로 잘못 표기.
* **Rollback:** 없음(조사 단계).
* **Effort:** 2–3 days. **Confidence:** high.
* **Exit:** JIT 기반이 feasible하다는 결론 + Phase 1 backlog 승인.

### Phase 1 — Baseline behavior capture + regression fixtures

* **Objective:** patch 전 ST layout/animation/visual을 고정하고, 성능/보안 fixture를 만든다.
* **Dependencies:** Phase 0.
* **Files (proposed):**

  * `vendor/jit/jit.2.0.1.js`, `vendor/jit/LICENSE`, `vendor/jit/MANIFEST.json`
  * `tests/visual/st-baseline.spec.ts`
  * `tests/fixtures/{small,deep,wide,large,unicode,faults,mixed}.json` (metadata only; 실제 파일은 generator)
  * `playwright.config.ts`, `vitest.config.ts`
  * `scripts/generate-fixtures.mjs`
* **Deliverables:** frozen baseline, screenshot baselines, fixture generator, initial perf marks.
* **Acceptance:**

  * baseline hash가 manifest와 일치.
  * 20/200/1,500-node ST가 고정 viewport/DPR/font에서 deterministic screenshot.
  * deep fixture에서 `eachLevel` 한계를 브라우저별로 기록.
  * filename injection/HTML test가 현재 실패하거나 위험을 재현.
* **Tests:** Playwright screenshot, DOM label count, console error 0, deep/wide smoke.
* **Platform evidence:** Windows 11 + Chromium/WebView2. macOS/Android/iOS는 Phase 4.
* **Risks:** font/AA 차이로 snapshot flaky. **Mitigation:** 고정 font, tolerance, Docker/동일 runner.
* **Rollback:** snapshot을 “informational”로 낮추고 behavior test만 gate.
* **Effort:** 8–10 days. **Confidence:** high.
* **Exit:** baseline 없이는 patch하지 않는다.

### Phase 2 — V2 adapter + incremental refactor

* **Objective:** `VisualizationAdapter` + `JitTreeView`를 만들고, 4개 patch를 적용해 모바일/Retina 기반을 확보한다.
* **Dependencies:** Phase 1.
* **Files (proposed):** `src/viz/jit/{JitTreeView.ts,treeToJit.ts,jit.d.ts}`, `src/viz/ProjectionBuilder.ts`, `src/viz/InputController.ts`, `src/platform/FileSourceAdapter.ts`, `vendor/jit/patches/\\\\\\\*.patch`, `scripts/build-jit.mjs`.
* **Deliverables:** mount/render/focus/fit/zoom/destroy, DPR patch, dispose patch, hit-test visible patch, label textContent patch, TS declarations, visual regression green.
* **Acceptance:**

  * 1,500 visible nodes에서 desktop ≥45fps. mobile fps는 Phase 4에서 측정한다.
  * 50회 mount/unmount 후 leak 없음.
  * DPR 1/2/3에서 label과 canvas 정렬, 선명도 확인.
  * hidden node click이 선택되지 않음.
  * `<img onerror>` filename이 DOM injection을 만들지 않음.
  * deep fixture에서 crash 없이 depth cap/list fallback.
* **Tests:** unit (projection/ID), visual, leak, security, perf smoke.
* **Platform evidence:** Windows 11 + Chromium/WebView2, macOS WKWebView(가능 시). Android/iOS는 Phase 4.
* **Risks:** patch drift, JIT 내부 가정 오류. **Mitigation:** patch ≤400줄, baseline diff test, ST layout 함수 미수정.
* **Rollback:** patch를 끄고 A-mode로 desktop slice만 진행; mobile은 보류.
* **Effort:** 15–20 days. **Confidence:** medium.
* **Exit:** adapter API freeze + patch set v1.

### Phase 3 — Desktop vertical slice (Windows first, macOS second)

* **Objective:** “폴더 선택 → graph → 파일 선택 → preview/open”를 데스크톱에서 완성한다.
* **Dependencies:** Phase 2; Phase 4 spike 결과는 gate로만.
* **Files (proposed):** `src-tauri/src/files/{mod.rs,windows.rs,macos.rs}`, `src/platform/desktop/DesktopFileSource.ts`, `src/app/\\\\\\\*`, `src/ui/\\\\\\\*`, `src/preview/renderers/\\\\\\\*`, `src/navigation/\\\\\\\*`.
* **Deliverables:** Tauri app, folder picker, lazy scanner, tree, breadcrumbs/back/root, search, TXT/MD/image/PDF preview, external open, error UI.
* **Acceptance:**

  * 10k-entry folder: first tree ≤1.2s p95, search ≤100ms, expand ≤300ms.
  * 2,000-depth fixture: no crash; list fallback.
  * permission denied/partial tree에서 앱이 죽지 않음.
  * filename injection/security tests pass.
  * preview limits/cleanup 동작.
* **Tests:** Rust unit (scan/containment), Playwright e2e, manual Windows/macOS matrix.
* **Platform evidence:** Windows 11 + macOS 14/15/26 (최소 1대 each), signed dev build.
* **Risks:** Tauri command/IPC 복잡도, macOS TCC. **Mitigation:** command surface 최소화, path containment test.
* **Rollback:** desktop-only release로 축소; mobile은 Phase 4 결과까지 보류.
* **Effort:** 15–20 days. **Confidence:** medium-high.
* **Exit:** desktop demo + budgets met.

### Phase 4 — Android/iOS filesystem/open feasibility spikes (pulled forward)

* **Objective:** SAF tree, iOS bookmark, external open/share, WebView rendering을 실제 기기에서 검증한다.
* **Dependencies:** Phase 1 (fixture) + minimal standalone JIT harness. full adapter는 필요하지 않다. **Schedule:** Phase 1과 병렬로 시작해 Phase 2 초반에 go/no-go.
* **Files (proposed):** `src-tauri/plugins/visual-directory-files/android/.../FilesPlugin.kt`, `.../ios/.../FilesPlugin.swift`, `src-tauri/plugins/.../src/{lib.rs,mobile.rs,desktop.rs}`, `tests/native/\\\\\\\*`.
* **Deliverables:** spike plugin (pick, list, read, open, share), device measurements, provider matrix, go/no-go memo.
* **Acceptance:**

  * Android: `ACTION\\\\\\\_OPEN\\\\\\\_DOCUMENT\\\\\\\_TREE` → persisted grant → app restart 후 list/read.
  * iOS: folder picker → bookmark → restart 후 resolve → list/read.
  * 각 플랫폼에서 1,000 entries enumerate, 20MB image/PDF open.
  * 800 visible nodes에서 30fps 이상, DPR 선명.
  * external open/share 성공/실패 fallback.
* **Tests:** instrumented Android test, XCTest, manual provider matrix (Local/Drive/OneDrive/iCloud/Files).
* **Platform evidence:** Android phone/tablet (API 29/33/36), iPhone/iPad (지원 최소 버전 + 최신). provider별 결과를 표로 기록.
* **Risks:** provider 편차, Tauri plugin build, WKWebView 성능. **Mitigation:** 3개 provider만 우선 지원, fallback UI, 필요 시 B안 전환.
* **Rollback:** Tauri mobile 포기 → Electron+Capacitor fallback (web UI 유지).
* **Effort:** 10–15 days. **Confidence:** low-medium.
* **Exit:** signed go/no-go. 실패 시 Phase 5 진입 금지.

### Phase 5 — Mobile integration, accessibility, performance

* **Objective:** 모바일 제품 UI, touch gesture, ARIA list, 성능/메모리 budget을 완성한다.
* **Dependencies:** Phase 4 go.
* **Files (proposed):** `src/ui/AccessibleTree.tsx`, `src/viz/InputController.ts`, `src/platform/{android,ios}/\\\\\\\*`, `src/preview/\\\\\\\*`, `src/app/responsive/\\\\\\\*`.
* **Deliverables:** Android phone/tablet, iPhone/iPad layouts, pinch/pan/tap, virtualized list, VoiceOver/TalkBack, Korean/English strings.
* **Acceptance:**

  * 30fps @ 800 nodes, memory budget, cancellation ≤250ms.
  * TalkBack/VoiceOver로 root→folder→file→preview 가능.
  * 44×44 touch target, focus visible, contrast 4.5:1.
  * rotation/resize/DPR change에서 layout 유지.
* **Tests:** device perf, accessibility audit, e2e, screenshot matrix.
* **Platform evidence:** Android phone/tablet + iPhone/iPad 실기기, TalkBack/VoiceOver, DPR 2/3.
* **Risks:** WebView memory, gesture conflict, AT label 품질. **Mitigation:** bounded labels, native list, early AT review.
* **Rollback:** graph 대신 list-first mobile UX로 축소(제품 요구 재협의).
* **Effort:** 20–25 days. **Confidence:** medium.
* **Exit:** mobile release candidate.

### Phase 6 — Packaging and release readiness

* **Objective:** 4개 플랫폼 signed artifact, store metadata, privacy/license, rollback.
* **Dependencies:** Phase 3/5.
* **Files (proposed):** `src-tauri/tauri.conf.json`, `.github/workflows/release.yml`, `docs/PRIVACY.md`, `THIRD\\\\\\\_PARTY\\\\\\\_NOTICES.md`, `docs/RELEASE-CHECKLIST.md`.
* **Deliverables:** Windows MSI/NSIS, macOS DMG (notarized), Android AAB, iOS IPA/TestFlight, release checklist.
* **Acceptance:**

  * clean VM/device install, no missing WebView2/NDK.
  * Windows SmartScreen/서명, macOS notarization/stapling, Android Play signing, iOS App Store review checklist.
  * license/privacy manifest 포함, JIT patch provenance 표기.
  * crash-free smoke 30분.
* **Tests:** install/uninstall, upgrade, permission revoke, offline, low disk.
* **Platform evidence:** Windows 11 clean VM, macOS 14/15/26 clean install, Android 10–16, iOS/iPadOS 지원 최소 버전+최신.
* **Risks:** signing delay, store review, macOS notarization. **Mitigation:** Phase 6 초반에 certificate/Apple account 확보.
* **Rollback:** phased rollout, previous artifact 유지.
* **Effort:** 15–20 days. **Confidence:** medium.
* **Exit:** public release.

### 9.1 Schedule summary

|Week|Work|
|-|-|
|0|Phase 0|
|1–2|Phase 1 + Phase 4 spike 시작|
|3|Phase 4 go/no-go|
|3–6|Phase 2|
|6–9|Phase 3|
|9–13|Phase 5|
|13–16|Phase 6|

1인 기준 약 17–22주, 2인 기준 약 10–13주. **Confidence: medium-low** (모바일 provider/signing 변수).

\---

## 10\. Risks, unresolved questions, next task (위험·미해결 질문·다음 작업)

### 10.1 Risk register

|Risk|Prob.|Impact|Mitigation|Trigger|
|-|-|-|-|-|
|JIT deep recursion crash|Medium|High|depth cap, list fallback, browser fixture|Phase 1 deep test|
|JIT DPR patch breaks transforms|Medium|High|baseline diff, 3 DPR tests|Phase 2|
|dispose patch incomplete|Medium|High|50x leak test, listener audit|Phase 2|
|hidden-hit/XSS regression|Low|High|patch + CSP + lint + security tests|Phase 2|
|Wide folder renders too many nodes|High|High|windowing, more-node, list view|Phase 1/2|
|Android SAF provider quirks|High|High|3 provider matrix, partial errors, fallback|Phase 4|
|iOS bookmark stale/copy|High|High|stale resolve, copy notice, share fallback|Phase 4|
|WKWebView perf|Medium|High|bounded graph, native preview, B안|Phase 4|
|Tauri mobile plugin build/debug|Medium|Medium|isolate plugin, CI device build, native engineer|Phase 4|
|PDF memory on mobile|Medium|Medium|caps, page virtualization, external|Phase 5|
|macOS MAS requirement|Low|Medium|V1 exclude MAS; bookmark plugin later|Phase 3|
|Signing/notarization delay|Medium|Medium|early cert/account, CI dry run|Phase 6|
|Upstream JIT stale|High|Low|vendor + patch + manifest|ongoing|
|License notice omission|Low|High|THIRD\_PARTY\_NOTICES + CI check|Phase 6|
|Filename/path injection|Medium|High|textContent, no shell, containment tests|Phase 2/3|

### 10.2 Unresolved questions

1. **제품 규모:** 100k entries가 목표인가, 1M인가? search를 full-scan할지, loaded-only로 할지.
2. **Mac App Store:** MAS 배포가 필수인가? 필수라면 Tauri 대신 Electron 또는 custom bookmark plugin이 필요하다.
3. **PDF 전략:** Android/iOS에서 pdf.js vs native QuickLook/PDF viewer 중 무엇을 기본으로 할지. Phase 4에서 측정 후 결정.
4. **iOS open-in-place:** iCloud/Drive/OneDrive에서 폴더가 copy로 오는 비율. copy를 제품적으로 허용할지.
5. **Browser edition:** 우선순위/지원 브라우저. Chromium-only로 명시할지.
6. **Hidden files:** 기본 숨김인가, toggle인가.
7. **Search semantics:** substring/case/Unicode normalization/초성 검색 여부.
8. **Auto-update:** Tauri updater를 쓸지, 수동 update로 시작할지.
9. **Telemetry/crash reporting:** local-first 원칙과 충돌하지 않는 범위.
10. **Preview limits:** 50MB/500p PDF, 40MB image가 실제 사용자에게 충분한가.

### 10.3 Plan review 후 가장 작은 다음 구현 task

**“Baseline을 고정하고, 실패하는 visual/leak test를 먼저 만든다.”**

정확한 순서:

1. `jit.js`를 `vendor/jit/jit.2.0.1.js`로 **바이트 동일** 복사하고 `MANIFEST.json`에 SHA-256/git blob/upstream URL을 기록한다.
2. `tests/fixtures/tree-small.json`(3 folders + 12 files)과 `tests/visual/st-baseline.spec.ts`를 만든다.
3. Playwright에서 JIT을 **classic script**로 로드하고, 고정 viewport/DPR/font로 ST를 mount해 screenshot을 캡처한다.
4. 같은 test에서 50회 mount/unmount 후 `.vd-node` 수와 active timer 수를 검사한다. dispose patch 전이므로 **실패해야 정상**이다.
5. 이 실패를 기준으로 `0002-dispose.patch`를 설계한다.

이 task는 코드를 최소로 만들고, 이후 모든 patch/architecture 결정의 회귀 기준을 세운다.

\---

## Appendix A — Evidence index

|Evidence|Location|Observation|
|-|-|-|
|MIT license/copyright|`jit.js:2-20`|Sencha/Nicolas Garcia Belmonte, MIT|
|Version|`jit.js:47`|`$jit.version = '2.0.1'`|
|Global exposure|`jit.js:38-45`|`this.$jit`, classic-script global|
|IIFE|`jit.js:24`, `18538-18541`|bundle wrapper|
|ST config|`jit.js:8791-8800`|levelsToShow 2, constrained, duration 700|
|ST init|`jit.js:8803-8832`|Canvas, Graph, Label, Plot, Op, Group, Geom|
|ST select|`jit.js:9216-9245`|no-animation focus|
|ST onClick|`jit.js:9275-9323`|contract/move/expand|
|ST lazy request|`jit.js:8982-8998`, `9369-9389`|callback request hook|
|ST culling|`jit.js:8045-8081`|level-based fit|
|Tree base size|`jit.js:9645-9653`|widest-level estimate|
|Tree layout recursion|`jit.js:8618-8667`|`design`/`red` recursion|
|Graph nodes map|`jit.js:4024-4025`|id-keyed object|
|Graph addNode|`jit.js:4139-4154`|duplicate ignored|
|computeLevels|`jit.js:5020-5041`|iterative BFS|
|eachLevel|`jit.js:5106-5121`|recursive traversal|
|Loader construct|`jit.js:8096-8145`|recursive JSON tree build|
|loadJSON/root|`jit.js:8263-8275`|tree/graph input|
|Plot loop|`jit.js:7310-7349`|all nodes each plot|
|Animation|`jit.js:869-876`|`setInterval`, fps 40|
|Hit test|`jit.js:2099-2112`|O(N), no drawn check|
|Event position|`jit.js:2082-2097`|canvas transform math|
|Touch manager|`jit.js:2033-2041`|touch listeners|
|Touch callbacks|`jit.js:2289-2317`|no pinch|
|Navigation|`jit.js:2650-2709`|mouse pan/wheel zoom|
|Canvas 2D only|`jit.js:3118`|`Canvas.Base\\\\\\\['2D']`|
|Canvas size|`jit.js:3135-3145`, `3169-3177`|CSS px = backing store|
|Scroll listener|`jit.js:2853-2859`|anonymous, not removed|
|HTML label|`jit.js:7943-7958`|`div`, id = node id|
|ST label placement|`jit.js:9928-9985`|absolute DOM, no truncation|
|Native label|`jit.js:7654-7682`|canvas text|
|innerHTML|`jit.js:1600`, `8383`, `13012`|filename/label injection path|
|disposeLabel|`jit.js:7846`|only label removal|
|NodeTypes|`jit.js:10058-10119`|shapes only|
|RGraph|`jit.js:17250-17299`|radial|
|Hypertree|`jit.js:17902-17918`|hyperbolic|

## Appendix B — Commands executed (selected)

```powershell
Get-FileHash .\\\\\\\\jit.js -Algorithm SHA256
git hash-object -- jit.js
# GitHub API: /repos/philogb/jit/contents/Jit/jit.js
# GitHub API: /repos/philogb/jit/contents/Jit/jit.js?ref=2.0.2
node --version   # v24.12.0
npm --version    # 11.6.2
Get-Command rea  # not found
npm ls -g --depth=0
npm view rea-agents version dist.unpackedSize engines --json  # EPERM (sandbox)
```

Node VM probe (요약):

```js
vm.runInContext(src, sandbox, { filename: 'jit.js' });
$jit.version; // '2.0.1'
// duplicate id -> first node kept
// eachLevel depth 5000 -> RangeError after 2459 visits
```

## Appendix C — Sources

* JIT upstream: https://github.com/philogb/jit
* JIT file: https://github.com/philogb/jit/blob/master/Jit/jit.js
* JIT 2.0.2 tag artifact: https://github.com/philogb/jit/blob/2.0.2/Jit/jit.js
* MIT license: https://github.com/philogb/jit/blob/master/LICENSE
* REA: https://github.com/morluto/rea
* REA JS workflows: https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md
* Tauri dialog: https://v2.tauri.app/plugin/dialog/
* Tauri fs: https://v2.tauri.app/plugin/file-system/
* Tauri opener: https://v2.tauri.app/plugin/opener/
* Tauri mobile plugins: https://v2.tauri.app/develop/plugins/develop-mobile/
* Tauri persisted scope: https://v2.tauri.app/plugin/persisted-scope/
* Tauri webview versions: https://v2.tauri.app/reference/webview-versions/
* Tauri iOS signing: https://v2.tauri.app/distribute/sign/ios/
* Tauri Android signing: https://v2.tauri.app/distribute/sign/android/
* Electron dialog: https://www.electronjs.org/docs/latest/api/dialog
* Electron shell: https://www.electronjs.org/docs/latest/api/shell
* Capacitor Filesystem: https://capacitorjs.com/docs/apis/filesystem
* Capacitor File Viewer: https://capacitorjs.com/docs/apis/file-viewer
* Capacitor environment setup: https://capacitorjs.com/docs/getting-started/environment-setup
* Capawesome File Picker: https://capawesome.io/docs/sdks/capacitor/file-picker/
* Android SAF: https://developer.android.com/training/data-storage/shared/documents-files
* Android `ACTION\\\\\\\_OPEN\\\\\\\_DOCUMENT\\\\\\\_TREE`: https://developer.android.com/reference/android/content/Intent#ACTION\_OPEN\_DOCUMENT\_TREE
* Apple `UIDocumentPickerViewController`: https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller
* Apple security-scoped resource: https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource()
* MDN File System API: https://developer.mozilla.org/en-US/docs/Web/API/File\_System\_API
* MDN `showDirectoryPicker`: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
* caniuse File System Access API: https://caniuse.com/native-filesystem-api
* Chrome FSA persistent permissions: https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
* pdf.js: https://mozilla.github.io/pdf.js/



## Deferred tutorial

Empty-start-screen usage tutorial slides and Previous/Next/Skip controls are NOT IMPLEMENTED. Comprehensive UI polish remains deferred.







## FileOrbit persistent storage and map backup — P1a/P1b/P2 IMPLEMENTED; P3 PLANNED

IndexedDB is the approved browser persistence direction for map metadata, authoritative tree data, original attachment Blobs, and necessary settings on PC, Android, and iPhone browser/PWA. The detailed source-grounded plan is [FILEORBIT-PERSISTENCE-AND-BACKUP-PLAN.md](engine/FILEORBIT-PERSISTENCE-AND-BACKUP-PLAN.md), plan revision **r35.1**.

Status: P1a persistence foundation and P1b explicit Save/Open UI are IMPLEMENTED and covered by repository plus actual main-entry tests against an IndexedDB-compatible test double. No automatic storage on startup, portable backup, dependencies, P3 backup, or native browser durability verification exists yet. P2 lifecycle/quota/conflict hardening is implemented. Folder-first large-map exploration remains deferred. Local IndexedDB is device/origin storage and is not a backup or cross-device synchronization service.





