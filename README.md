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

## Supabase 연결 (클라우드 동기화)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만든다.
2. 대시보드 **SQL Editor**에 [supabase/schema.sql](supabase/schema.sql) 내용을 붙여 넣고 실행한다.
3. `.env.example`을 복사해 `.env.local`을 만들고, **Project Settings → API**의 Project URL과 Publishable key를 채운다.
4. 개발 서버를 다시 시작하면 로그인 화면이 나온다. 계정을 만들고 로그인한다.

## 구조

```
src/
  app/(main)/        캘린더 · 할 일 · 로드맵 · 설정 화면
  components/        앱 틀(사이드바/하단 탭), 로그인, 캘린더, 설정
  lib/data/          저장소 (로컬 / Supabase) 와 전역 상태
  lib/               타입, 색상 팔레트, 날짜 도우미
supabase/schema.sql  DB 테이블 · 보안 규칙(RLS) · 실시간 설정
```

## 진행 상황

- [x] 1단계: 일정 CRUD (종일·여러 날), 카테고리·태그, 일/주/월 보기, 드래그 이동·길이 조절, 다크 모드, 로그인·동기화 코드
- [ ] 2단계: 할 일
- [ ] 3단계: 반복 일정, 알림
- [ ] 4단계: 로드맵
