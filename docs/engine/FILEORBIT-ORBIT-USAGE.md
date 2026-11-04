# FileOrbit Orbit 사용 안내

## Orbit와 원본 폴더

Orbit는 사용자가 직접 고른 폴더를 지도 보관함으로 사용하는 기능입니다. 원본 파일/폴더를 자동으로 가져오거나 수정하지 않습니다. Orbit 안에는 최상위 `.orbit` 파일만 표시됩니다. `.map`과 `.fileorbit`은 더 이상 지원되지 않습니다.

Orbit를 닫거나 새로고침해도 실제 `.orbit` 파일은 그대로 남습니다. 다만 브라우저 보안상 새로고침 후에는 폴더 접근을 다시 허용해야 합니다.

## 기존 폴더를 Orbit로 선택

파일 탐색기나 운영체제에서 기존 폴더를 만든 뒤, FileOrbit에서 그 폴더를 Orbit로 선택합니다. FileOrbit가 별도 Orbit 폴더를 만들거나 “Create Orbit” 화면을 제공하지 않습니다. 현재 세션에서만 연결되며 새로고침 후에는 기존 폴더를 다시 선택합니다.

- **Open File**: 통합 Open map 창을 엽니다.
  - 현재 Orbit 폴더 이름과 최상위 `.orbit` 목록을 함께 보여줍니다.
  - **Choose folder** / **Change folder**로 Orbit 폴더를 선택·변경합니다.
  - **Refresh**로 목록을 새로 고칩니다.
  - 목록의 지도를 선택하면 기존 보호된 Orbit Open 경로로 열립니다.
  - **Open file elsewhere…**는 `.orbit` 파일 하나를 엽니다. `.map`/`.fileorbit` 파일은 거부됩니다.
  - **Close**로 현재 지도/Orbit를 바꾸지 않고 닫습니다.

폴더/파일 선택 창은 해당 버튼을 누른 사용자 클릭에서 바로 열립니다. 폴더만 선택해도 현재 지도는 교체되지 않으며, 첫 지도를 자동으로 열지 않습니다. 목록의 지도를 열어도 standalone 파일을 열어도 Orbit가 자동으로 연결·변경되지 않습니다.

## Create Map

Create Map을 누르면 Orbit 관리 화면 없이 바로 지도 폼이 열립니다. 지도 제목과 선택적 파일/폴더, Save location, Create Map, Cancel이 한 화면에 있습니다.

- 연결된 Orbit가 있으면 그 폴더가 기본 Save location입니다. **Change save location**으로 다른 기존 폴더를 고를 수 있습니다.
- Orbit가 없으면 **Choose save location**으로 기존 폴더를 선택해 Orbit로 연결합니다. 폴더 선택 창에는 기존 `.orbit` 파일이 보이지 않을 수 있습니다. 폴더를 고르는 것만으로 지도가 만들어지거나 현재 지도가 교체되지는 않습니다.
- **Save elsewhere…**를 선택하면 Orbit와 별도로 standalone 파일로 저장합니다.
- 폴더 선택을 취소해도 입력한 제목과 파일/폴더 선택은 유지됩니다.

Choose an existing folder as your Orbit. New maps use that folder by default while it remains connected.

- Orbit 연결 전 안내: “Choose the folder where your maps will be saved. Map files may not appear in the folder selection window.”
- 선택 성공: “Save location selected: <folder name>.”
- 선택 취소: “Location selection cancelled. Your map details were kept.”
- 기존에 저장된 지도는 connected Orbit 메뉴와 **Open File** 브라우저에서 엽니다.

제목만 입력한 지도는 root 하나와 첨부 0개로 생성됩니다. 파일/PDF/YAML을 추가하면 해당 바이트가 함께 저장됩니다.

## Save / Save As / Download

- **자동 저장**: 노드 drag/reparent, Undo, Redo가 성공하면 기존 목적지로 자동 저장을 요청합니다. 배경 camera pan, 선택/이동, zoom/resize, 거절된 drop은 저장하지 않습니다.
- **Save As**: 다른 위치/이름으로 저장합니다. Orbit 밖으로 저장할 수 있습니다. 자동 저장이 실패하거나 목적지가 없으면 feedback 영역의 **Retry**/**Save As**를 사용하세요.
- **Connected Orbit 메뉴**: Orbit가 연결되어 있으면 Save As와 Settings 사이에 폴더 아이콘과 실제 폴더 이름이 나타납니다. 폴더 이름을 클릭하면 최상위 `.orbit` 목록이 펼쳐지고, 목록의 지도를 열거나 **Refresh list**로 외부 변경을 다시 읽을 수 있습니다. 현재 지도가 표시됩니다. 별도의 Close/Disconnect 또는 Add to Orbit 버튼은 없습니다. Orbit가 없으면 메뉴 자체가 숨겨집니다.
- **Download**: 파일 시스템에 직접 쓸 수 없는 브라우저에서 다운로드로 대체합니다. 이 경우 저장 완료를 확정하지 않습니다.

에디터 폼의 Save, Retry/Close, 교체 전 Save and continue는 그대로 유지됩니다. Settings에는 **Theme**만 있으며, 문서/저장 상태는 화면 하단의 고정 feedback 영역에 표시됩니다. 자동 저장은 한 번에 하나만 실행되고, 연속 변경은 최신 revision으로 합쳐집니다.

Orbit에 있는 지도를 Save할 때 목적지가 외부에서 바뀌었으면 충돌 안내가 뜹니다. Open map 창은 지도 열기/폴더 선택 중에는 목록 상태를 표시하고, 닫거나 다시 연 뒤의 이전 요청 결과는 새 창에 반영하지 않습니다. 자동 덮어쓰기는 하지 않습니다. Cancel은 외부 파일과 로컬 편집을 보존하고, 확인한 Overwrite만 실제로 덮어씁니다.

## Copy Map

그래프 도구 모음의 **Copy Map**은 현재 지도의 커밋된 내용과 첨부를 새 `.orbit` 사본으로 복사합니다.

- 도구 모음 순서: Search → Undo → Redo → Embed → Fullscreen → Copy Map → Download.
- 클릭하면 운영체제 폴더 선택 창이 열립니다. 선택한 폴더는 사본 저장 위치일 뿐 연결된 Orbit를 바꾸지 않습니다.
- 원본 파일, 활성 목적지, dirty 상태, 저장 revision, history, recovery 소유권은 바뀌지 않습니다.
- 사본은 자동으로 열리지 않습니다.
- 같은 이름이 있거나 0바이트 파일이 있으면 덮어쓰지 않고 명확히 거절합니다.
- 편집기 draft는 사본에 포함하지 않습니다.
- 성공하면 “Map copied to <folder name>.”이 표시됩니다. 선택한 폴더가 연결된 Orbit와 같은 폴더일 때만 Orbit 목록을 새로 고칩니다.
- 폴더 접근을 지원하지 않는 브라우저에서는 Copy Map이 불가능하다고 안내하며 Download를 폴더 선택으로 오해하게 하지 않습니다.

## 새로고침과 재승인

새로고침은 주소창 옆 **새로고침 아이콘**을 사용하세요. 키보드 새로고침 단축키 대신 아이콘을 사용하세요.

확장자는 항상 `.orbit`입니다. 이전 `.map`/`.fileorbit` 문서는 열리지 않으며, 이름만 `.orbit`으로 바꿔도 내용 검증을 통과해야 합니다.

확장 사이드바의 원형 **?** 도움말은 `.orbit` 파일, Orbit 폴더, 폴더 선택/열기 방법을 설명하며 Open 동작을 실행하지 않습니다.

새로고침 후 FileOrbit는 저장된 폴더 접근 권한을 유지하지 않습니다. Orbit 폴더를 다시 열어 접근을 허용해야 합니다. 이는 브라우저의 파일 시스템 접근 정책 때문입니다.

## 복구와 브라우저 fallback

- 편집 중인 지도는 브라우저의 복구 저장소에 별도로 체크포인트될 수 있습니다.
- 복구는 실제 `.orbit` 파일과 별개입니다.
- 복구된 작업을 보관하려면 Orbit 또는 standalone으로 명시적으로 저장/복사하세요.
- Orbit 폴더 쓰기를 지원하지 않는 브라우저에서는 Create/Open Orbit를 제공하지 않고 standalone 열기/다운로드로 안내합니다.
- Orbit의 실제 폴더 쓰기, 권한, 외부 변경 감지는 브라우저/플랫폼에 따라 지원 여부가 다릅니다.

## 알려진 제약

- `.orbit` 생성은 원자적/exclusive 생성이 아니며 rollback을 보장하지 않습니다.
- 실패/취소 후 빈 파일이나 부분 파일이 남을 수 있고 자동 삭제하지 않습니다.
- preflight와 실제 write 사이에 외부 변경이 끼어들 수 있습니다.
- Orbit 폴더 핸들은 새로고침 후 유지되지 않습니다.
- watching, recursion, rename/delete, synchronization은 아직 없습니다.
- stale Open Orbit 선택이 컨트롤러에 남을 수 있습니다.

네이티브 검증 현황은 [FileOrbit Orbit Slice 6 native acceptance report](FILEORBIT-ORBIT-NATIVE-ACCEPTANCE-r121.md)를 참고하세요.
