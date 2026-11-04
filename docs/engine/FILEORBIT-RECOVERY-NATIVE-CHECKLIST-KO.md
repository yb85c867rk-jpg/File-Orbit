# FileOrbit Recovery Native Acceptance Checklist (Korean)

상태: **NOT RUN**. 이 문서는 수동 확인 절차이며, 자동 테스트/HTTP 확인은 native acceptance가 아니다.

URL: `http://127.0.0.1:8099/tests/harness/m5-exploration/`

## 준비

- 동일한 브라우저 프로필, 동일 origin/port를 처음부터 끝까지 사용한다.
- 작은 disposable 테스트 map과 작은 PDF를 사용한다.
- IndexedDB를 초기화하거나 사용자 문서를 덮어쓰지 않는다.
- 테스트 훅을 켜거나 상태를 바꾸는 console 명령을 사용하지 않는다.

## 먼저 구분할 것

- 편집기 form의 Save는 편집을 적용하고, 경우에 따라 문서 파일도 저장할 수 있다.
- recovery가 보존하는 것은 **문서에 confirmed Save되지 않은 authoritative 편집**이다.
- 편집기 form 안에 입력만 하고 제출하지 않은 텍스트는 checkpoint되지 않는다.
- confirmed file Save는 그 Save가 포함하는 recovery checkpoint를 retire할 수 있다.
- 새로고침 직후는 durability 보장이 아니다. checkpoint가 완료될 시간을 두고 확인한다.

선택적 read-only 확인: DevTools → Application → IndexedDB → `fileorbit` → `recoveryCheckpoints`에서 해당 이름의 checkpoint row를 **보기만** 한다. 삭제/수정하지 않는다. 일반 브라우저에는 checkpoint 완료를 보여주는 production 진단 UI가 별도로 노출되어 있지 않다.

## A. 새로고침 후 Recover

1. Create Map으로 `Native-Recover-A`를 만들고 작은 PDF를 추가한다. form을 제출해 편집을 적용하되 confirmed document Save는 하지 않는다.
2. checkpoint가 완료될 시간을 둔다. 필요하면 위 read-only IndexedDB 확인만 사용한다.
3. 새로고침한다. 브라우저 leave/reload 경고가 나오면 수락한다.
4. 복구 다이얼로그가 표시되는지 확인한다.
5. **Recover work**를 선택한다.
6. map 이름/구조가 맞는지, PDF가 viewer에서 열리는지, 문서가 unsaved/no-handle 상태인지 확인한다.

## B. 복구 작업 저장

1. **Save As**로 새 disposable `.map` 파일을 저장한다.
2. 저장 성공 상태를 확인한다.
3. 그 파일을 다시 열어 PDF가 정상인지 확인한다.
4. 관련 없는 이전 recovery candidate가 남아 있을 수 있다. 모든 candidate가 사라질 것을 요구하지 않는다.

## C. Later

1. 또 다른 disposable unsaved recovery candidate를 만든다.
2. 새로고침 후 **Later**를 선택한다.
3. 다시 새로고침하고 그 candidate가 여전히 목록에 있는지 확인한다.

## D. Discard

1. 그 disposable candidate만 정확히 선택한다.
2. **Discard recovery**를 선택한다.
3. 새로고침 후 선택한 candidate가 사라졌는지 확인한다.
4. 독립적으로 저장한 `.map` 파일은 여전히 존재하고 열리는지 확인한다.

## E. Workflow 전환

1. 복구 다이얼로그에서 **Create Map** 또는 **Open File**을 선택한다.
2. 복구 다이얼로그가 닫히는지 확인한다.
3. 잠시 기다린 뒤, 선택한 workflow 뒤에서 recovery map이 설치되지 않는지 확인한다.
4. 선택한 Create/Open workflow가 그대로 유지되는지 확인한다.

## F. 기본 접근성/레이아웃

- 키보드 Tab/Shift+Tab이 다이얼로그 안에서 순환하는지 확인한다.
- 초기 focus가 **Later**인지 확인한다(비파괴적).
- Escape로 닫히는지 확인한다.
- 좁은 화면과 fullscreen에서 dialog가 읽고 조작하기 쉬운지 확인한다.

PC, Android, iPhone 결과를 각각 별도로 기록한다. 타이밍 race를 수동으로 재현할 필요는 없다. 해당 race는 controlled automated tests가 담당한다.
