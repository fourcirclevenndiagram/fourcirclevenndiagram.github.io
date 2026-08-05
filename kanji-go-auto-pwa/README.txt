漢字でGO! Neon Auto Museum
===========================

구성
- index.html: 화면 구조
- styles.css: 모바일·네온 UI와 전환 애니메이션
- app.js: 자동 재생, 설정, 저장, WebGL/Canvas, WebAudio
- kanji-data.js: ID 1~500 전체 문제와 일본어·한국어 해설
- manifest.webmanifest / service-worker.js: 설치형 PWA와 오프라인 캐시
- icon*.svg / icon-*.png: 앱 아이콘
- .nojekyll: GitHub Pages 정적 파일 호환

GitHub Pages 업로드
1. ZIP을 푼 뒤 폴더 안의 파일을 저장소 루트에 모두 업로드합니다.
2. GitHub 저장소 Settings → Pages에서 배포 원본을 main 브랜치 / (root)로 지정합니다.
3. 첫 접속 뒤 한 번 새로고침하면 전체 500문제가 오프라인 캐시에 저장됩니다.

조작
- 화면 중앙 탭 또는 Space: 일시정지/재생
- 좌우 스와이프 또는 ←/→: 이전/다음
- F: 즐겨찾기
- D: 어려운 문제

주의
- PWA와 오프라인 캐시는 HTTPS인 GitHub Pages에서 작동합니다.
- 파일을 직접 두 번 눌러 file://로 열어도 학습 화면은 실행되지만 PWA 설치와 오프라인 캐시는 등록되지 않습니다.
- iPhone의 효과음과 배경음은 Safari 정책상 첫 화면 터치 뒤 활성화됩니다.

문제 원본
- 漢字でGO！問題集 @wiki 「Lv.6 (ID:1~500)」
  https://w.atwiki.jp/yuia_sk/pages/23.html
- 해설은 원문의 뜻을 학습 화면에 맞게 짧게 재구성하고 한국어 풀이를 덧붙였습니다.
