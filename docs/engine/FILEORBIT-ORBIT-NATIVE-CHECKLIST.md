# FileOrbit Orbit 네이티브 수동 점검표 (Slice 6)

상태: **사용자 PC 수동 테스트 통과 보고됨** (독립 검증 아님). 자동화 환경의 네이티브 피커/파일시스템 검증은 여전히 BLOCKED입니다. 이 문서는 실제 브라우저에서 사람이 다시 수행할 점검표입니다.

- 앱 주소: `http://127.0.0.1:8099/tests/harness/m5-exploration/`
- 테스트 폴더: `evidence/native-r121/FileOrbit-Native-Acceptance`
- 새로고침은 **주소창 옆 새로고침 아이콘**만 사용하세요. 키보드 새로고침 단축키 대신 아이콘을 사용하세요.
- 각 항목은 PASS / FAIL / BLOCKED / NOT RUN 중 하나로 기록합니다.
- 원본 사용자 문서/폴더는 사용하지 마세요.
- 왼쪽 레일에는 Save가 없어야 합니다. Settings에는 Theme만 있어야 하며, 자동 저장 실패 시 하단 feedback의 Retry/Save As를 사용합니다.
- Open은 **Open File** 하나이며, 하나의 Open map 창에서 폴더·현재 Orbit 목록·Choose/Change folder·Refresh·Open file elsewhere…·Close를 제공해야 합니다.

## A. Orbit 선택과 목록

- [ ] A1. **Open File**을 눌러 통합 Open map 창을 열고 **Choose folder**로 `Orbit Parent/Existing Orbit`을 선택한다.
  - 기대: Orbit 이름이 표시되고 현재 Orbit이 활성화된다.
  - 결과:
- [ ] A2. 같은 창에 최상위 `.orbit` 목록이 채워지는지 확인한다.
  - 기대: `populated.orbit`, `zero.orbit`, `invalid.orbit`만 보이고 `notes.txt`는 보이지 않는다.
  - 결과:
- [ ] A3. 브라우저 밖에서 `Orbit Parent/Existing Orbit`에 `external-added.orbit`을 추가하고 Refresh한다.
  - 기대: 새 `.orbit`이 목록에 나타난다. 삭제 후 Refresh하면 사라진다.
  - 결과:
- [ ] A4. **Open File → Change folder**에서 피커를 취소한다.
  - 기대: 현재 Orbit과 지도가 유지되고 취소 피드백이 표시된다.
  - 결과:
- [ ] A5. Open map 창의 Close와 Orbit의 Close를 구분하고, Orbit Close 후 지도가 계속 보이는지 확인한다.
  - 기대: 문서/지도는 유지되고 Orbit 목록만 닫힌다.
  - 결과:

## B. Create Orbit / Create Map

- [ ] B1. Create Map → Create Orbit → 이름 `Native Orbit A` → 부모로 `Orbit Parent` 선택.
  - 기대: 실제 `Native Orbit A` 폴더가 생성된다.
  - 결과:
- [ ] B2. title-only로 Create Map.
  - 기대: per-map Save 피커가 뜨지 않고 `<title>.orbit`이 생성된다.
  - 결과:
- [ ] B3. 생성한 `.orbit`을 다시 열고 root가 정확히 하나인지 확인.
  - 결과:
- [ ] B4. PDF/YAML이 있는 populated map을 Create Map으로 생성.
  - 결과:
- [ ] B5. 다시 열어 PDF/YAML attachment를 열어 본다.
  - 기대: 원본 바이트와 내용이 보인다.
  - 결과:

## C. 충돌 안전성

- [ ] C1. 기존 `populated.orbit`과 같은 이름으로 Create.
  - 기대: 덮어쓰지 않고 명시적 충돌 오류.
- [ ] C2. 대소문자만 다른 이름(`POPULATED.MAP`)으로 Create.
  - 기대: 대소문자 충돌로 차단.
- [ ] C3. `zero.orbit`과 같은 이름으로 Create.
  - 기대: 0바이트 파일도 충돌로 차단.
- [ ] C4. 거절 전후 SHA-256 비교, 다른 이름/Cancel 가능 확인.
  - 결과:

## D. 보호된 Save

- [ ] D1. Orbit map을 편집하고 **Settings → Save changes**로 저장. 왼쪽 레일에 Save가 없어야 한다. 실제 파일을 다시 열어 편집/첨부 확인.
- [ ] D2. 외부에서 `populated.orbit`을 `external-changed.orbit` 바이트로 교체.
- [ ] D3. 원래 편집 세션에서 Save → 충돌/덮어쓰기 확인.
- [ ] D4. Cancel: 외부 파일과 로컬 편집 모두 보존되는지 확인.
- [ ] D5. 명시적 Overwrite: 확인 후에만 덮어쓰기.
- [ ] D6. Save a Copy: 별도 파일 생성.
- [ ] D7. Save a Copy에서 원래 목적지 선택 → 보호 우회 불가.
- [ ] D8. Save As로 Orbit 밖에 저장 후 Settings Save changes → 보호 유지.
- [ ] D9. 권한/write/close 실패는 재현 가능할 때만 기록. 불가하면 NOT RUN.

## E. Add to Orbit

- [ ] E1. Orbit 밖 standalone map을 열고 커밋된 unsaved 편집을 만든다.
- [ ] E2. Add to Orbit. 사본에 편집 내용과 정확한 첨부가 있는지 확인.
- [ ] E3. 원본 SHA-256, 활성 목적지, dirty 상태가 그대로인지 확인.
- [ ] E4. 사본이 자동으로 열리지 않는지 확인.
- [ ] E5. 같은 이름으로 Add → 안전하게 거절되는지 확인.

## F. Editor / 교체 / 복구

- [ ] F1. Editor Save가 기존 목적지를 사용하는지 확인.
- [ ] F2. dirty replacement Cancel: 기존 map 보존.
- [ ] F3. Save and continue: 저장 완료 후 교체.
- [ ] F4. 복구된 unsaved map을 명시적으로 Orbit에 Save/Copy.
- [ ] F5. 복구가 실제 문서 파일과 분리되어 있는지 확인.
- [ ] F6. 새로고침 후 Orbit 재승인이 필요한지 확인.

## G. 레이아웃 / 상호작용

- [ ] G1. 데스크톱과 390px narrow에서 가로 스크롤 없음.
- [ ] G2. 왼쪽 rail 펼침/접힘, Details 펼침/접힘.
- [ ] G3. 활성 editor draft가 보이고 유지됨.
- [ ] G4. 키보드 포커스, tooltip, 스크롤, fullscreen, theme.
- [ ] G5. 실제 node reparent → Undo → Redo.
- [ ] G6. 배경 camera pan과 undoable tree edit를 구분.
- [ ] G7. 성공한 reparent/Undo/Redo 후 자동 저장이 한 번에 하나씩 실행되고, 연속 변경이 최신 revision으로 합쳐지는지 확인.
- [ ] G8. 자동 저장 실패 후 Retry/Save As가 표시되고, conflict Cancel 후 자동 재시도가 없는지 확인.
- [ ] G9. Settings에 Theme 외 항목이 없는지 확인.
- [ ] G10. Save As와 Settings 사이의 connected Orbit 메뉴에서 폴더 아이콘/실제 이름, 접기/펼치기, 현재 지도 표시, Refresh/Close/Add를 확인.
- [ ] G11. Orbit가 없을 때 connected 메뉴와 아이콘이 보이지 않는지 확인.
- [ ] G12. 헤더에 X/Close FileOrbit 버튼이 없고 브라우저 탭으로 종료하는지 확인.
- [ ] G13. Create Map이 Orbit 관리 화면 없이 바로 제목 입력과 Save location을 보여주는지 확인.
- [ ] G14. Create Map에서 연결된 Orbit가 기본 저장 위치이며 Change save location/Choose save location/Save elsewhere가 동작하는지 확인.
- [ ] G15. 펼친 레일에서는 사이드바 툴팁이 없고 접힌 레일에서는 아이콘 툴팁이 보이는지 확인.
- [ ] G16. 승인된 variation 06 로고 자산이 제공되면 텍스트 대신 표시되는지 확인.
- [ ] G17. 도구 모음이 Search→Undo→Redo→Embed→Fullscreen→Copy Map→Download 순서이고 Copy Map의 접근성 이름/tooltip이 맞는지 확인.
- [ ] G18. Copy Map이 폴더 선택 후 커밋된 트리/첨부를 정확히 복사하고, 사본을 활성 문서로 바꾸지 않으며 Orbit를 바꾸지 않는지 확인.
- [ ] G19. 같은 폴더/원본/0바이트 충돌에서 덮어쓰기 없이 명확한 feedback이 나오는지 확인.
- [ ] G20. 연결된 Orbit와 같은 폴더에 복사할 때만 목록이 새로 고쳐지는지 확인.
- [ ] G21. 사이드바에 Close/Add to Orbit가 없고, 폴더 이름 클릭으로 목록이 펼쳐지며 Refresh list로 외부 변경을 읽는지 확인.
- [ ] G22. Orbit 상태/업데이트 메시지가 목록 아래에 표시되고 live region이 유지되는지 확인.
- [ ] G23. Create Map과 connected Orbit 아이콘이 로컬 PNG 마스크로 표시되고 dark/light 및 접힘/펼침에서 20x20으로 보이는지 확인.
- [ ] G24. 사이드바 Open Orbit의 라벨/접근성 이름/툴팁과 새 folder_supervised 아이콘이 표시되는지 확인.
- [ ] G25. 통합 열기 대화상자 제목이 Open Orbit Folder이고 aria-labelledby가 유지되는지 확인.
- [ ] G26. 드래그/드롭 거부 메시지가 모두 영어이고 사용자 지도/파일 이름은 그대로인지 확인.

## 플랫폼

- [ ] PC Chromium
- [ ] Android Chrome (기기/네트워크가 준비된 경우만)
- [ ] iPhone Safari (기기/네트워크가 준비된 경우만)
- [ ] Firefox/Safari fallback (Orbit 미지원 표시 확인)

## 기록 형식

```text
ID:
플랫폼/브라우저:
단계:
관찰 결과:
판정: PASS / FAIL / BLOCKED / NOT RUN
스크린샷:
출력 파일:
SHA-256:
비고:
```

현재 자동/브라우저 증거는 `docs/engine/FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md`와 `evidence/native-r121/`에 있습니다. 네이티브 결과는 아직 없습니다.
