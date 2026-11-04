# FileOrbit 그래프 탐색 프로토타입 (Roadmap B)

합성 테스트 자료이며 유료 기능이 아닙니다. 루트는 실제 20개 카테고리 샘플의 `map-input`을 표시 루트로 사용합니다. 래퍼 폴더는 문서에 보존됩니다.

## 실행

```powershell
cd C:\Users\openw\Documents\Projects\FileOrbit-git
python -m http.server 8163 --bind 127.0.0.1 --directory .
```

Chrome/Edge: `http://127.0.0.1:8163/tests/harness/large-map/index.html`

## 그래프 중심 탐색

- 초기: 표시 루트 + 20개 1차 카테고리.
- 폴더 클릭: 해당 폴더를 현재 초점으로 만들고 즉시 하위 폴더/파일을 표시. 이전 가지는 숨김.
- 하위 폴더 클릭: 같은 방식으로 다음 단계 진행.
- 파일 클릭: 폴더 확장이 아니라 선택 + 미리보기만.
- 그래프가 주 인터페이스이며 목록은 없음. 브레드크럼/뒤로/루트로 보조.
- 숨겨진 노드는 문서에 그대로 남고 직렬화/삭제되지 않음.

## 카메라

- 마우스 휠: 포인터 기준 확대/축소.
- 폴더 클릭: 새 장면에 맞춰 자동 확대/축소 애니메이션.
- `+`, `−`, `Fit`.
- 배경 드래그: 이동. 클릭과 드래그 구분.
- 자동 이동 중 휠/드래그는 애니메이션 취소.
- 확대 시 라벨 표시가 늘어나며 선택/검색 대상은 유지.

## 샘플과 실제 수치

- `20개 카테고리 · depth 3–7`: 전체 246노드, `map-input` 표시 루트 241노드, 20개 카테고리, 첨부 122개. 실제 `.orbit`에서 파생.
- synthetic flat/wide/balanced/mixed/deep 300/1,000 스트레스 샘플 유지.
- 1,000 노드는 내부 테스트 문맥이며 유료 활성화가 아님.

## 검색/미리보기

- 검색 결과 이전/다음 페이지, 검색 지우기.
- 결과 클릭 시 숨은 가지로 이동하고 대상 선택.
- TXT/MD/PDF/PNG 유효 미리보기. PDF는 유효한 최소 PDF, PNG는 유효한 PNG.
- 미리보기 URL은 DOM 제거 후 revoke.

## 검증

- Edge 실행: `evidence/large-map/graph-execution.json`, `graph-depth.json`.
- 20개 카테고리 초기 21개 장면 노드.
- depth 3/7 그래프 전용 클릭, 브레드크럼/뒤로/루트로 확인.
- 폴더 클릭 자동 zoom-in(0.68→1.125), 뒤로 시 복원.
- 휠 확대, 배경 팬, 파일 그래프 클릭, PNG/PDF 미리보기.
- 검색 20페이지(1,000 샘플)와 2페이지 이동, Clear.
- 1,000 노드 실제 1000, 한 stage, unmount 시 tree null/컨트롤 비활성.
- 자동 검사는 기능 확인이며 사람 사용성 승인 아님.
- Native picker/disk acceptance NOT RUN.
