# Daypath: Claude 작업 안내

@AGENTS.md

## 먼저 읽을 것

- [docs/SPEC.md](docs/SPEC.md): 기획, 데이터 구조, 화면 규칙, 개발 단계와 진행 상황, **결정 기록**. 작업을 시작하기 전에 반드시 읽는다.
- [README.md](README.md): 실행 방법과 폴더 구조

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
- DB 스키마를 바꾸면 `supabase/schema.sql`을 함께 고치고, 사용자에게 Supabase SQL Editor에서 실행해 달라고 안내한다.
