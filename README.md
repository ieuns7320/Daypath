# Daypath

하루하루가 목표로 이어지는 길: 일정, 할 일, 로드맵을 하나로 관리하는 개인용 앱.

- 일정 (일간 / 주간 / 월간, 드래그, 반복, 종일·여러 날)
- 할 일 (완료 체크, 마감일, 타임 블로킹)
- 카테고리 · 태그 (색상, 필터)
- 로드맵 (목표 → 마일스톤 → 일정/할 일, 진행률)

아이패드, PC, 맥북, 휴대폰에서 쓰는 PWA. 자세한 기획은 [docs/SPEC.md](docs/SPEC.md)를 참고.

## 기술 스택

Next.js 16 · React 19 · Tailwind CSS 4 · FullCalendar 7 · Supabase · next-themes

## 실행

```bash
npm install
npm run dev
```

http://localhost:3000 에서 열린다.

`.env.local`이 없으면 **로컬 모드**로 동작한다. 데이터가 이 브라우저(localStorage)에만 저장되고 기기 간 동기화는 되지 않는다.

이미 쓰고 있는 Supabase 프로젝트로 **다른 PC에서 이어서 작업**할 때는 아래 "Supabase 연결"을 다시 할 필요 없이 `.env.local`만 만들면 된다. 자세한 순서와 현재 상태는 [SPEC 10장](docs/SPEC.md#10-다른-pc에서-이어서-작업하기)을 본다.

```bash
npx next typegen   # 처음 한 번: 라우트 타입 생성
npx tsc --noEmit   # 타입 검사
npx eslint src     # 린트
npx next build     # 프로덕션 빌드 확인
```

## Supabase 연결 (클라우드 동기화)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만든다.
2. 대시보드 **SQL Editor**에 [supabase/schema.sql](supabase/schema.sql) 내용을 붙여 넣고 실행한다. 이어서 [supabase/migrations/](supabase/migrations/)의 파일을 번호 순서대로 실행한다.
3. `.env.example`을 복사해 `.env.local`을 만들고, **Project Settings → API**의 Project URL과 Publishable key를 채운다.
4. 개발 서버를 다시 시작하면 로그인 화면이 나온다. 계정을 만들고 로그인한다.

## 구조

```
src/
  app/(main)/        캘린더 · 할 일 · 로드맵 · 설정 화면 (layout: 로그인 → 데이터 → 앱 틀)
  components/        앱 틀(app-shell: 사이드바/하단 탭), 로그인(auth-gate), 준비 중 화면
    calendar/        캘린더, 할 일 패널(타임 블로킹), 캘린더 색·모양 CSS
    editor/          일정·할 일 공용 편집 창
    tasks/           할 일 탭, 할 일 행, 체크박스
    filter/          모바일 필터 시트
    settings/        테마, 카테고리·태그 관리, 로그아웃
  lib/data/          Supabase 클라이언트, 저장소(로컬 / Supabase), 전역 상태(필터 포함)
  lib/               타입, 색상 팔레트, 날짜 도우미, 할 일 그룹 나누기
supabase/schema.sql  기본 DB 테이블 · 보안 규칙(RLS) · 실시간 설정
supabase/migrations/ 이후 추가된 테이블 (번호 순서대로 실행)
docs/SPEC.md         기획 · 화면 규칙 · 결정 기록 · 다른 PC 세팅
.claude/launch.json  개발 서버 설정 (3000 클라우드 / 3001 로컬 모드)
```

데이터 흐름과 새 테이블을 추가할 때 고칠 곳은 [SPEC 10.4](docs/SPEC.md#104-코드-구조와-데이터-흐름)에 있다.

## 진행 상황

- [x] 1단계: 일정 CRUD (종일·여러 날), 카테고리·태그, 일/주/월 보기, 드래그 이동·길이 조절, 다크 모드, 로그인·동기화 코드
- [x] 2단계: 할 일 탭, 캘린더에 할 일 표시, 타임 블로킹(드래그), 카테고리·태그 필터
- [ ] 3단계: 반복 일정, 알림
- [ ] 4단계: 로드맵
