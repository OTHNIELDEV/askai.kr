# ASKAI Browser Extension

ASKAI 아스카이 스크린샷 확장프로그램입니다.

## 기능

- 마우스 오른쪽 클릭 메뉴에 `ASKAI` 추가
- `보이는 화면 캡처`
- `영역 선택 캡처`
- 캡처 미리보기에서 `복사`, `저장`, `복사 후 ASKAI 열기`
- 툴바 팝업에서도 같은 캡처 기능 실행

## 빌드

```bash
npm run extension:build
```

빌드 결과:

- Chrome / Edge: `extension/dist/chrome`
- Firefox: `extension/dist/firefox`

## Chrome / Edge 설치

1. `chrome://extensions` 또는 `edge://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램을 로드`를 누릅니다.
4. `extension/dist/chrome` 폴더를 선택합니다.

## Firefox 설치

1. `about:debugging#/runtime/this-firefox`를 엽니다.
2. `임시 부가 기능 로드`를 누릅니다.
3. `extension/dist/firefox/manifest.json`을 선택합니다.

## 개발 메모

기본 ASKAI 주소는 `http://localhost:3001/`입니다. 확장 팝업이나 캡처 미리보기에서 이 주소를 바꿀 수 있습니다.
