-- Daypath 3c: 알림 (Web Push) (2026-11-09)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 구조
--   1. 앱(브라우저)이 앞으로 30일치 알림을 계산해 push_queue 에 예약한다 (replace_push_queue).
--      반복 일정 계산이 앱 코드에 있으므로 서버는 시각만 보고 보낸다.
--   2. pg_cron 이 1분마다 send_due_pushes() 를 실행해, 보낼 때가 된 알림을
--      pg_net 으로 Vercel 의 /api/push 에 넘긴다. Vercel 이 VAPID 키로 서명해 기기에 보낸다.
--   3. 비밀 값(공유 비밀, 앱 주소)은 Supabase Vault 에 둔다 (이 파일 맨 아래 안내).

-- ---------- 확장 기능 ----------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- 일정별 알림 ----------
-- 시간 일정: 시작 몇 분 전 (0 = 정시). 종일 일정: 그날 "종일 알림 시각"에서 몇 분 전 (0 = 당일, 1440 = 전날)
alter table public.events
  add column if not exists reminders integer[] not null default '{}';

-- ---------- 사용자 알림 설정 (모든 기기 공통) ----------
create table if not exists public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  event_reminders  integer[] not null default '{10}',   -- 새 시간 일정의 기본 알림
  allday_time      text not null default '09:00',      -- 종일 일정 알림 시각 "HH:MM"
  task_digest      boolean not null default true,      -- 하루 할 일 묶음 알림
  task_time        text not null default '09:00',      -- 할 일 알림 시각 "HH:MM"
  updated_at       timestamptz not null default now(),
  constraint user_settings_allday_time check (allday_time ~ '^\d{2}:\d{2}$'),
  constraint user_settings_task_time check (task_time ~ '^\d{2}:\d{2}$')
);

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;
alter table public.user_settings enable row level security;
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- 기기별 푸시 구독 ----------
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

revoke all on public.push_subscriptions from anon;
grant select, delete on public.push_subscriptions to authenticated;
alter table public.push_subscriptions enable row level security;
drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()));

-- 구독 등록: 같은 기기(endpoint)를 다른 계정이 쓰던 경우에도 지금 계정으로 옮긴다
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, uid, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- ---------- 보낼 알림 예약 ----------
create table if not exists public.push_queue (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  send_at   timestamptz not null,
  title     text not null,
  body      text not null default '',
  url       text not null default '/',
  kind      text not null default 'auto',   -- 'auto' = 앱이 계산한 것, 'test' = 테스트 알림
  sent_at   timestamptz
);

create index if not exists push_queue_due_idx on public.push_queue (send_at) where sent_at is null;
create index if not exists push_queue_user_idx on public.push_queue (user_id);

revoke all on public.push_queue from anon;
grant select on public.push_queue to authenticated;
alter table public.push_queue enable row level security;
drop policy if exists "own queue" on public.push_queue;
create policy "own queue" on public.push_queue
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 앱이 계산한 예약을 통째로 바꾼다 (아직 안 보낸 'auto' 예약만 지우고 새로 넣음)
-- items: [{ "send_at": ISO 시각, "title": ..., "body": ..., "url": ... }, ...]
create or replace function public.replace_push_queue(items jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.push_queue where user_id = uid and sent_at is null and kind = 'auto';
  insert into public.push_queue (user_id, send_at, title, body, url)
  select uid,
         (x ->> 'send_at')::timestamptz,
         left(coalesce(x ->> 'title', ''), 200),
         left(coalesce(x ->> 'body', ''), 500),
         coalesce(x ->> 'url', '/')
  from jsonb_array_elements(coalesce(items, '[]'::jsonb)) as x
  where (x ->> 'send_at')::timestamptz > now()
  limit 2000;
end $$;

revoke execute on function public.replace_push_queue(jsonb) from public, anon;
grant execute on function public.replace_push_queue(jsonb) to authenticated;

-- 테스트 알림: 1분 안에 이 계정의 모든 기기로 간다
create or replace function public.queue_test_push() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.push_queue (user_id, send_at, title, body, url, kind)
  values (uid, now(), 'Daypath 테스트 알림', '알림이 잘 오고 있어요.', '/settings', 'test');
end $$;

revoke execute on function public.queue_test_push() from public, anon;
grant execute on function public.queue_test_push() to authenticated;

-- ---------- 발송 (pg_cron 이 1분마다 실행) ----------
create or replace function public.send_due_pushes() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
  v_url text;
  v_ids bigint[];
  r record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'daypath_push_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'daypath_app_url';
  if v_secret is null or v_url is null then return; end if;

  -- 보낼 때가 된 예약을 잡고(동시에 돈 실행과 겹치지 않게) 보낸 것으로 표시
  select array_agg(id) into v_ids
    from (select id from public.push_queue
           where sent_at is null and send_at <= now()
           for update skip locked) as t;

  if v_ids is not null then
    update public.push_queue set sent_at = now() where id = any (v_ids);

    for r in
      select d.id, d.title, d.body, d.url,
             jsonb_agg(jsonb_build_object(
               'endpoint', s.endpoint,
               'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)
             )) as subs
        from public.push_queue d
        join public.push_subscriptions s on s.user_id = d.user_id
       where d.id = any (v_ids)
         and d.send_at > now() - interval '15 minutes'   -- 너무 늦어진 알림은 보내지 않는다
       group by d.id, d.title, d.body, d.url
    loop
      perform net.http_post(
        url := rtrim(v_url, '/') || '/api/push',
        body := jsonb_build_object('title', r.title, 'body', r.body, 'url', r.url, 'tag', r.id::text, 'subscriptions', r.subs),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 10000
      );
    end loop;
  end if;

  delete from public.push_queue where send_at < now() - interval '2 days';
end $$;

revoke execute on function public.send_due_pushes() from public, anon, authenticated;

-- Vercel 이 "이 기기는 구독이 끝났다"(404/410)는 답을 받으면 지운다. 공유 비밀로 확인한다.
create or replace function public.remove_push_subscriptions(p_secret text, p_endpoints text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'daypath_push_secret';
  if v_secret is null or p_secret is distinct from v_secret then raise exception 'forbidden'; end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end $$;

revoke execute on function public.remove_push_subscriptions(text, text[]) from public;
grant execute on function public.remove_push_subscriptions(text, text[]) to anon, authenticated;

-- 1분마다 실행 (같은 이름이면 덮어씀)
select cron.schedule('daypath-send-pushes', '* * * * *', $cron$select public.send_due_pushes()$cron$);

-- ---------- 실행 후 한 번: 비밀 값 넣기 ----------
-- 아래 두 줄의 값을 바꿔서 따로 실행하세요. (PUSH_SECRET 은 Vercel 환경 변수와 같은 값)
--   select vault.create_secret('여기에_PUSH_SECRET', 'daypath_push_secret');
--   select vault.create_secret('https://daypath-ten.vercel.app', 'daypath_app_url');
-- 값을 바꿀 때:
--   select vault.update_secret((select id from vault.secrets where name = 'daypath_push_secret'), '새_값');
