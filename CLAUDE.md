# Daypath: Claude 작업 안내

@AGENTS.md

## 먼저 읽을 것

- [docs/SPEC.md](docs/SPEC.md): 기획, 데이터 구조, 화면 규칙, 개발 단계와 진행 상황, **결정 기록**. 작업을 시작하기 전에 반드시 읽는다.
  - 10장: 현재 운영 상태(실행한 SQL, Supabase·배포 상태), 개발 서버, 코드 구조·데이터 흐름, 알려진 문제, **다음 단계 시작 전 논의할 것**
- [README.md](README.md): 실행 방법과 폴더 구조

## 사용자에 대해

- 개인용 앱을 직접 쓰려고 만드는 사람. 여러 PC(Windows 등)와 아이패드·휴대폰에서 쓴다.
- 화면 취향: 미니멀, 다크 모드, 24시간제, 한 주는 일요일 시작, 색은 칠하지 않고 테두리로 구분.
- 요청이 모호하면(예: "가로 부분", "좁아 보여") 어느 부분인지 먼저 짧게 확인한다. 추측해서 다른 곳을 고치지 않는다.

## 작업 규칙

- 사용자와는 **한국어**로 대화한다.
- 큰 기능은 코드를 짜기 전에 사용자와 구상을 먼저 맞춘다.
- **작업이 끝날 때마다** 그 작업에서 새로 정한 내용(동작 규칙, UI 결정, 라이브러리 버전, 데이터 규칙 등)을 `docs/SPEC.md`의 해당 본문과 "11. 결정 기록" 표에 반영한다. 진행 상황 표(8장)도 함께 갱신한다.
- 커밋과 push는 사용자가 원할 때 한다. SPEC 변경은 해당 작업과 같은 커밋에 넣는다.
- `.env.local`(Supabase 키)은 절대 커밋하지 않는다.

## 명령어

```bash
npm run dev        # 개발 서버 (http://localhost:3000)
npx tsc --noEmit   # 타입 검사 (처음이면 npx next typegen 먼저)
npx eslint src     # 린트
npx next build     # 프로덕션 빌드 확인
```

## 주의할 점

- Next.js 16(Cache Components 켜짐), FullCalendar 7을 쓴다. 학습된 지식과 API가 다를 수 있으니 `node_modules`의 문서와 타입 정의를 확인한다. 자세한 내용은 SPEC 2장 "구현 시 주의"를 본다.
- DB 스키마를 바꾸면 `supabase/migrations/`에 다음 번호의 SQL 파일을 추가하고, 사용자에게 Supabase SQL Editor에서 실행해 달라고 안내한다.
- 클라우드 데이터를 건드리지 않고 시험할 때는 `.claude/launch.json`의 `daypath-local-mode`(포트 3001, 로컬 모드) 서버를 쓴다. `next dev`는 한 번에 하나만 뜨므로 3000을 끄고 켠다. 끝나면 3000(`daypath-dev`)으로 되돌린다.
- 3000번(클라우드)에는 사용자의 실제 데이터가 있다. 확인용으로 만든 항목은 바로 지우고, 기존 데이터는 바꾸거나 지우지 않는다.
- 사용자 대신 계정을 만들거나 비밀번호를 입력하지 않는다. Supabase secret / service_role 키는 받지도, `.env.local`에 넣지도 않는다.
- 작업 확인 순서: 브라우저 화면(데스크톱·모바일 375px, 라이트/다크) → `npx tsc --noEmit` → `npx eslint src` → (큰 변경이면) `npx next build`.
- 셸은 Windows(PowerShell / Git Bash)다. `git push`의 `NativeCommandError` 표시는 대개 성공이다.
