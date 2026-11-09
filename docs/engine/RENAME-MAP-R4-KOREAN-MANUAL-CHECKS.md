# Rename Map R4 — Windows 수동 점검

대상: `eval/hypertree-1000-capacity`
주의: 실제 사용자 파일이 아니라 **복사한 disposable `.orbit` 파일**로만 점검합니다. OntoMap 또는 사용자 원본 디렉터리는 사용하지 않습니다.

## 준비
1. Windows에서 FileOrbit을 열고 Map Library에 disposable 폴더를 연결합니다.
2. `.orbit` 파일 2개를 복사해 둡니다: 하나는 일반 이름, 하나는 root 제목과 파일명이 다른 파일.
3. 자동 저장이 꺼진 테스트 프로필 또는 복사본 폴더를 사용합니다.

## 점검 항목
1. root 우클릭: `Rename Map…`, `Edit Description…`가 보이고 `Edit Folder…`는 보이지 않는가?
2. 하위 폴더 우클릭: 기존 `Edit Folder…`가 그대로 보이는가?
3. `Rename Map…` 대화상자: 현재 파일명, 검증된 상위 폴더, 정확한 `.orbit` 미리보기가 보이는가?
4. 이름을 입력하면 preview가 즉시 바뀌고, 조정된 이름은 확인 전에 설명되는가?
5. Cancel 및 Escape로 닫히고 원본 파일이 그대로인가? 닫은 뒤 포커스가 원래 조작 위치로 돌아오는가?
6. 다른 이름으로 Rename: 새 파일 1개 생성, 검증, 원본 1개 제거. 폴더에 새 파일만 남는가?
7. Rename 후 Details/root label이 새 제목이고, 다음 Save가 새 파일에 쓰는가?
8. dirty 상태(하위 항목 이동/편집)에서 Rename: 새 파일에 dirty 내용이 포함되는가?
9. 같은 파일명이 되는 title-only 변경: create/remove 없이 기존 guarded Save로 제목만 저장되는가?
10. 완전 동일 이름: 아무 파일도 쓰지 않고 “이미 일치” 안내 후 닫히는가?
11. 대소문자만 다른 이름: 명확한 미지원 안내, 쓰기 없음.
12. 충돌 이름: 기존 파일을 덮어쓰지 않고 충돌 안내.
13. 권한 거부: 원본 유지, 파일 생성/삭제 없음.
14. 상위 폴더 확인 불가: Rename Map을 사용할 수 없는 이유와 파일 유지 안내.
15. `Edit Description…`: 이름/Link 필드 없이 설명만 편집되고 기존 history 경로에 기록되는가?
16. Rename 전 structural Undo: root 제목은 새 제목으로 유지되고, 디스크 파일명은 바뀌지 않는가?
17. Rename 전 root description Undo: 설명은 되돌아가고 root 제목은 새 제목으로 유지되는가?
18. 아주 오래된 title-only history entry: visible edit을 주장하지 않고 skip되며 revision이 늘지 않는가?
19. 부분 출력/원본 유지: 두 파일이 모두 남고 완료로 표시되지 않는가?
20. 제거 후 불확실: 새 파일/원본 상태를 그대로 보고하고, Save가 차단되며, 재검사/재열기 경로가 안내되는가?
21. 채택 실패: 디스크 rename 완료 후에도 성공 표시가 없고 Save가 차단되는가?
22. 앱 재시작/재열기: 새 root 제목, 편집 내용, 첨부 바이트가 동일한가?
23. Rename 직후 재열기 없이 `Edit Description…`: 폼에 기존 설명이 미리 채워지고, 새 설명(한국어 IME 조합 후 Save 포함)을 저장하면 `B.orbit`을 decode한 값과 정확히 같은가? 폼은 저장 파일 decode가 일치할 때만 닫혀야 한다.
24. 설명 변경 저장 실패(인코딩/권한/검증): 폼이 닫히지 않고 Retry Save / Save As와 이유가 보이며, 입력과 적용 내용이 유지되는가? Retry Save 후에는 decode된 설명이 일치하는가?
25. 변경 없이 Save: 폼이 닫히고 “No changes. Nothing was written.”가 화면에 보이며 파일이 바뀌지 않는가?
26. 실패 재현 시 보고: `window.__M5_EDITOR_DIAGNOSTIC__`의 `action`, `stage`, `reason`, `changed`, `write` 값과 화면 문구를 기록한다. 설명 텍스트/경로/핸들은 포함하지 않는다.
27. 적용된 편집 복구 **Save As**: 저장 실패 후 Save As로 새 파일을 만들고, 다시 열어 설명/첨부 바이트가 정확한가? 취소·검증 불가·대상 불일치에서는 편집기와 초안이 유지되고 "파일이 이미 있을 수 있음"이 안내되는가? 확정 성공 후 다음 일반 Save가 새 파일에 쓰는가?

## Windows 외부 파일 변경 점검 (테스트 복사본)

준비: 사용자 원본이 아닌 테스트 폴더에 `.orbit` 복사본 2개를 두고 Map Library로 연결한 뒤 하나를 엽니다. OntoMap과 사용자 소스 폴더는 사용하지 않습니다.

1. 앱 밖에서 `A.orbit`을 `A2.orbit`으로 이름 변경 → **Refresh**: 목록에 `A2.orbit`이 보이고 `A.orbit`은 사라지는가? 열린 지도, 편집 내용, 보기, 히스토리가 유지되는가? Windows에서는 같은 파일이므로 `A2` 항목이 현재 파일로 표시되어야 한다.
2. 그 상태에서 Save: 예전 이름으로 쓰지 않고 "외부에서 이름이 바뀌었다"는 안내와 Save As가 제공되는가? `A2.orbit`의 바이트와 수정 시각이 그대로인가?
3. 앱 밖에서 `A2.orbit`을 하위 폴더로 이동하거나 삭제 → **Refresh**: "목록에 없음"이 권한 거부/잘린 목록과 구분되어 보이는가? Save, 자동 저장(편집 후), Retry Save가 예전 파일을 다시 만들지 않는가?
4. 같은 이름으로 **다른** `.orbit` 파일을 복사 → Save: 다른 파일을 덮어쓰지 않고 충돌/복구 안내가 나오는가? 파일 바이트가 그대로인가?
5. Save As로 새 파일에 저장 → 다시 열어 설명과 첨부 바이트가 정확한가? 이후 일반 Save가 새 파일에 쓰는가?
6. 목록 실패(권한 거부 또는 열거 오류): 마지막 목록이 유지되고 Reconnect/Refresh 안내가 나오는가? 다른 Library로 전환한 뒤 늦게 끝난 새로고침이 B의 목록을 덮어쓰지 않는가?
7. **Refresh 없이** 외부에서 이름 변경/삭제/같은 이름 교체 후 바로 Save: 각각 차단(미싱/치환)되고 대상에 0회 쓰기인가? 같은 이름의 다른 파일이 보존되는가? Save As로 별도 대상에 정확히 저장되는가?
8. Library A의 map을 연 뒤 B를 선택: Save가 현재 목록이 아니라 A에 바인딩된 부모로 검증되는가? A에서 파일을 지우면 (Refresh 없이) 미싱으로 차단되는가?

## 사이드바 Save / Close Map 점검 (테스트 복사본)

1. 다른 Library를 선택한 상태에서 **Save**: 열린 지도의 원래 파일에 저장되고, 새로 선택한 폴더의 같은 이름 파일은 변경되지 않는가?
2. 원본 파일을 Explorer에서 삭제하거나 다른 파일로 교체한 뒤 **Save**: 편집 내용이 유지되고 **Save As**로 새 파일을 저장할 수 있는가?
3. 편집이 없는 지도에서 **Close Map**: 빈 작업 영역으로 돌아가고, Library 연결/선택/디스크 파일은 유지되는가?
4. 편집이 있는 지도에서 **Close Map**: **Save and continue / Discard changes / Cancel**이 모두 동작하는가? Save는 저장이 확인된 뒤에만 닫고, 취소/실패 시 지도와 편집 내용이 남는가?
5. 저장 대상이 없는 지도에서 Close Map → Save: 기존 Save As 선택기가 열리고, 취소하면 지도가 유지되는가?
6. 쓰기는 끝났지만 다시 읽어 확인할 수 없는 경우(파일이 다른 앱에 의해 바뀌었거나 읽기 실패): "파일이 기록되었지만 확인할 수 없습니다" 안내와 함께 지도/편집/복구 체크포인트가 유지되는가? 이전 저장 대상(첫 저장이면 대상 없음)이 보존되고, 안내대로 Cancel 후 Save As로 다른 파일에 저장할 수 있는가?

## Windows Map Library 폴더 이동/이름 변경/삭제 점검 (테스트 복사본)

준비: 사용자 원본이 아닌 테스트 폴더에 `.orbit` 복사본을 두고 Map Library로 연결합니다. OntoMap과 사용자 소스 폴더는 사용하지 않습니다.

1. 테스트 Library 폴더를 Explorer에서 같은 드라이브의 새 이름으로 변경 → **Refresh**: 브라우저가 핸들을 유지하면 목록과 표시 이름이 새 이름으로 갱신되는가? 핸들이 무효면 "폴더를 열 수 없음"과 **Change linked folder**가 보이고 마지막 목록이 "out of date"로 표시되는가? 열린 지도와 편집 내용은 유지되는가?
2. 폴더를 다른 위치로 이동 → Change linked folder → 이동한 폴더를 선택 → 같은 Library ID가 유지되고 목록이 읽히는가? 취소하면 기존 연결이 그대로인가?
3. 폴더 삭제 후 새 폴더에 같은 이름의 `.orbit`을 넣고 Change linked folder로 연결: 예전에 열린 지도에서 Save해도 새 폴더의 같은 이름 파일에 **0회 쓰기**인가? Save As로 편집 내용이 별도 파일에 보존되는가?
4. 폴더 권한 거부 → **Reconnect Map Library** 안내가 보이고, 허용 후 목록이 복구되는가? 취소 시 기존 연결이 유지되는가?
4a. 앱을 다시 시작했을 때 읽기 권한은 허용으로 보이지만 폴더 목록 읽기가 거부되면, 같은 **Reconnect Map Library** 안내가 보이는가? 폴더를 찾을 수 없으면 **Change linked folder**, 알 수 없는 읽기 실패면 **Refresh**와 **Change linked folder**가 보이는가? 시작 중에 다른 Library를 선택하면 늦게 끝난 복원이 새 목록/안내를 덮어쓰지 않는가?
5. 다른 Library에 이미 연결된 폴더를 선택 → 중복 생성 없이 기존 Library가 선택되는가?
6. 앱 재시작: 이동/재연결한 Library가 선택된 상태로 복원되고 목록이 보이는가?
7. 다른 Library로 전환하는 동안 늦게 끝난 Refresh가 새 Library의 목록을 덮어쓰지 않는가?

## 증거 구분
- OPFS/disposable Edge 검증은 R4 자동화 증거입니다.
- Native Windows File System Access 동작(특히 close/rename/remove, 외부 프로세스 경쟁)은 별도 수동 승인 항목이며 OPFS 결과로 대체하지 않습니다.
- 외부 프로세스가 두 이름 사이에서 파일을 바꾸는 경쟁은 자동으로 원자적 no-clobber를 보장하지 않습니다.
