-- ============================================================================
-- Picklejp Community Map — Supabase schema
--
-- HOW TO USE:
--   1. In Supabase Dashboard, go to: SQL Editor > New query
--   2. Paste this entire file and click "Run"
--   3. You should see "Success. No rows returned."
--
-- WHAT IT DOES:
--   - Creates the `members` table
--   - Enables Row Level Security (RLS)
--   - Allows anonymous visitors to READ published rows and INSERT new rows
--   - Allows only the service role (admins via Supabase dashboard) to UPDATE/DELETE
--   - Seeds the table with 11 demo members so the site isn't empty on launch
-- ============================================================================

-- Drop in reverse order if you want a clean rebuild (uncomment next 3 lines):
-- drop policy if exists "Public read published" on public.members;
-- drop policy if exists "Public insert"         on public.members;
-- drop table if exists public.members;

-- ---------- Table ----------
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  name          text not null,
  location      text,
  lat           double precision,
  lng           double precision,
  country       text,
  level         text,
  venues        jsonb default '[]'::jsonb,
  days          text[] default '{}',
  times         text[] default '{}',
  email         text,
  sns           text,
  bio           text,
  notes         text,
  is_published  boolean default true
);

-- Helpful index for distance-sorted queries and country filtering
create index if not exists members_country_idx on public.members (country);
create index if not exists members_is_published_idx on public.members (is_published);

-- ---------- Row Level Security ----------
alter table public.members enable row level security;

-- Anyone (including anon) can read rows that are published
drop policy if exists "Public read published" on public.members;
create policy "Public read published"
  on public.members
  for select
  using (is_published = true);

-- Anyone can insert a new member (self-registration)
-- The `is_published` column defaults to true; to enable moderation later,
-- change the default to false and add an admin-only policy.
drop policy if exists "Public insert" on public.members;
create policy "Public insert"
  on public.members
  for insert
  with check (true);

-- UPDATE / DELETE are intentionally NOT granted to anon.
-- Use the Supabase dashboard (as admin) to moderate entries.

-- ---------- Seed data ----------
insert into public.members
  (name, location, lat, lng, country, level, venues, days, times, email, sns, bio, notes)
values
  ('Miyu', 'Fujisawa, Kanagawa, Japan', 35.3391, 139.489, 'Japan', 'advanced',
   '[{"name":"湘南海浜公園","full":"湘南海浜公園, Fujisawa, Kanagawa, Japan","lat":35.3186,"lng":139.4755},
     {"name":"Mizuno Sports Plaza 茅ヶ崎","full":"Mizuno Sports Plaza Chigasaki, Kanagawa, Japan","lat":35.3333,"lng":139.4053}]'::jsonb,
   ARRAY['sat','sun'], ARRAY['morning','day'],
   'miyu@example.com', 'IG: @miyu.pickle',
   '湘南でトーナメント出てます。練習仲間募集！',
   'Webサイト https://shonan-pickle.jp/ から月会費で登録。ドロップインも可（1,000円）。'),

  ('Taro', 'Osaka, Japan', 34.6937, 135.5023, 'Japan', 'beginner',
   '[{"name":"大阪プール","full":"大阪プール, Osaka, Japan","lat":34.695,"lng":135.500},
     {"name":"服部緑地","full":"服部緑地, Toyonaka, Osaka, Japan","lat":34.7845,"lng":135.4827}]'::jsonb,
   ARRAY['tue','thu','sat'], ARRAY['evening'],
   null, 'FB: Taro M.',
   'はじめて半年。楽しく打ち合いしたいです🎾',
   'Facebookグループ『Osaka Pickleball』で参加表明。初回レッスンあり（500円）。'),

  ('Sarah', 'Kyoto, Japan', 35.0116, 135.7681, 'Japan', 'intermediate',
   '[{"name":"Kyoto City Gym","full":"Kyoto City Gymnasium, Kyoto, Japan","lat":35.0116,"lng":135.7681}]'::jsonb,
   ARRAY['mon','wed','fri'], ARRAY['evening','night'],
   null, 'IG: @sarah.play',
   'Moved from SF. DUPR ~3.6. Looking for rec + comp play.',
   'DM me on IG, or join LINE group ''Kansai Picklers'' — say hi in English or Japanese!'),

  ('Ken', 'Fukuoka, Japan', 33.5902, 130.4017, 'Japan', 'intermediate',
   '[{"name":"シーホークコート","full":"Hilton Fukuoka Sea Hawk, Fukuoka, Japan","lat":33.5873,"lng":130.3577},
     {"name":"舞鶴公園テニスコート","full":"舞鶴公園, Fukuoka, Japan","lat":33.5886,"lng":130.3828}]'::jsonb,
   ARRAY['sat','sun'], ARRAY['morning'],
   null, 'IG: @fukuoka_pickle',
   '九州勢、増やしたい！',
   'Instagram @fukuoka_pickle にDM。毎週土日朝、予約制。'),

  ('Aya', 'Sapporo, Hokkaido, Japan', 43.0642, 141.3469, 'Japan', 'beginner',
   '[{"name":"北海きたえーる","full":"北海きたえーる, Sapporo, Japan","lat":43.0644,"lng":141.3647}]'::jsonb,
   ARRAY['sun'], ARRAY['day'],
   null, 'IG: @aya.sapporo',
   '冬場はインドア中心。',
   '個別連絡（IGのDM）でOK。初心者会を月2回開催中。'),

  ('Ryu', 'Naha, Okinawa, Japan', 26.2124, 127.6809, 'Japan', 'advanced',
   '[{"name":"奥武山運動公園","full":"奥武山運動公園, Naha, Okinawa, Japan","lat":26.2004,"lng":127.6779},
     {"name":"宜野湾海浜公園","full":"宜野湾海浜公園, Ginowan, Okinawa, Japan","lat":26.2897,"lng":127.7383}]'::jsonb,
   ARRAY['wed','fri','sat','sun'], ARRAY['morning','evening'],
   'hello@okinawa-pickle.com', 'IG: @okinawa_pickle',
   'Pickleball in Okinawa! Tourists welcome.',
   'Website https://okinawa-pickle.com からメンバー登録。旅行者ドロップイン歓迎。'),

  ('Yuki', 'Honolulu, Hawaii, USA', 21.3099, -157.8581, 'United States', 'intermediate',
   '[{"name":"Ala Moana Beach Park Courts","full":"Ala Moana Beach Park, Honolulu, HI, USA","lat":21.2906,"lng":-157.8486},
     {"name":"Central Oahu Regional Park","full":"Central Oahu Regional Park, Waipahu, HI, USA","lat":21.4040,"lng":-158.0079}]'::jsonb,
   ARRAY['tue','thu','sat','sun'], ARRAY['morning'],
   null, 'IG: @yuki.hnl.pickle',
   'ハワイ在住15年。出張・旅行中の日本の方歓迎！',
   'LINEオープンチャット『Hawaii 日本語Pickle』で参加表明。朝6:30〜、日本語OK。'),

  ('Shin', 'San Francisco, California, USA', 37.7749, -122.4194, 'United States', 'advanced',
   '[{"name":"Presidio Wall Courts","full":"Presidio Wall Playground, San Francisco, CA, USA","lat":37.7881,"lng":-122.4489},
     {"name":"Memorial Park (Cupertino)","full":"Memorial Park, Cupertino, CA, USA","lat":37.3230,"lng":-122.0316}]'::jsonb,
   ARRAY['mon','wed','sat'], ARRAY['evening','night'],
   null, 'IG: @bayarea_nikkei_pickle',
   '日本語でワイワイやってます。出張者大歓迎🇯🇵🇺🇸',
   'Bay Area 日系Pickleクラブ。Slackに招待制で参加。'),

  ('Emma', 'Los Angeles, California, USA', 34.0522, -118.2437, 'United States', 'intermediate',
   '[{"name":"Cheviot Hills Recreation Center","full":"Cheviot Hills, Los Angeles, CA, USA","lat":34.0467,"lng":-118.4065}]'::jsonb,
   ARRAY['wed','sat','sun'], ARRAY['morning','evening'],
   null, 'IG: @la_jpickle',
   'South Bay中心。Little Tokyoで集まることも',
   'MeetupグループとWhatsAppコミュニティあり。DMください。'),

  ('Mako', 'Singapore', 1.3521, 103.8198, 'Singapore', 'intermediate',
   '[{"name":"Kallang Pickleball Courts","full":"Kallang, Singapore","lat":1.3020,"lng":103.8724},
     {"name":"OCBC Arena","full":"OCBC Arena, Singapore","lat":1.3035,"lng":103.8740}]'::jsonb,
   ARRAY['sun'], ARRAY['morning'],
   null, 'FB: SG Nikkei Pickle',
   '駐在員メインのゆるグループ。家族連れOK。',
   'Facebookグループ『Singapore 日本人Pickleball』に参加申請。毎週日曜9時〜。'),

  ('Takuya', 'São Paulo, Brazil', -23.5505, -46.6333, 'Brazil', 'beginner',
   '[{"name":"Clube Nipo Brasileiro","full":"Clube Nipo Brasileiro, São Paulo, Brazil","lat":-23.5619,"lng":-46.6286}]'::jsonb,
   ARRAY['sat','sun'], ARRAY['day'],
   null, 'IG: @sp_nikkei_pickle',
   '南米唯一（たぶん）の日系ピックル会。仲間募集中！',
   '日系クラブ経由で参加。日曜午後に定例会。ポル語/日本語どちらもOK。');

-- ---------- Edit feature (run db/2026-06-03-edit-feature.sql) ----------
-- 本人編集機能（編集トークン）。実体は db/2026-06-03-edit-feature.sql。
-- ここはドキュメント整合のための同内容コピー。

-- トークン保管テーブル（anonからは直接読めない: RLS有効・ポリシー無し）
create table if not exists public.member_edit_tokens (
  member_id uuid primary key references public.members(id) on delete cascade,
  token     uuid not null
);
alter table public.member_edit_tokens enable row level security;

-- 登録（members挿入 + トークン保存を一括・原子的に）
create or replace function public.register_member(p_payload jsonb, p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
begin
  insert into public.members
    (name, location, lat, lng, country, level, venues, days, times, email, sns, bio, notes)
  values (
    p_payload->>'name',
    nullif(p_payload->>'location',''),
    nullif(p_payload->>'lat','')::double precision,
    nullif(p_payload->>'lng','')::double precision,
    nullif(p_payload->>'country',''),
    p_payload->>'level',
    coalesce(p_payload->'venues','[]'::jsonb),
    coalesce((select array_agg(value) from jsonb_array_elements_text(p_payload->'days')), '{}'),
    coalesce((select array_agg(value) from jsonb_array_elements_text(p_payload->'times')), '{}'),
    nullif(p_payload->>'email',''),
    nullif(p_payload->>'sns',''),
    nullif(p_payload->>'bio',''),
    nullif(p_payload->>'notes','')
  )
  returning id into new_id;
  insert into public.member_edit_tokens (member_id, token) values (new_id, p_token);
  return new_id;
end;
$$;

-- 編集用に1件取得（トークン一致時のみ）
create or replace function public.get_member_for_edit(p_id uuid, p_token uuid)
returns public.members
language sql
security definer
set search_path = public
as $$
  select m.*
  from public.members m
  join public.member_edit_tokens t on t.member_id = m.id
  where m.id = p_id and t.token = p_token;
$$;

-- 更新（トークン一致時のみ）
create or replace function public.update_member(p_id uuid, p_token uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.member_edit_tokens
                 where member_id = p_id and token = p_token) then
    raise exception 'invalid edit token';
  end if;
  update public.members set
    name     = p_payload->>'name',
    location = nullif(p_payload->>'location',''),
    lat      = nullif(p_payload->>'lat','')::double precision,
    lng      = nullif(p_payload->>'lng','')::double precision,
    country  = nullif(p_payload->>'country',''),
    level    = p_payload->>'level',
    venues   = coalesce(p_payload->'venues','[]'::jsonb),
    days     = coalesce((select array_agg(value) from jsonb_array_elements_text(p_payload->'days')), '{}'),
    times    = coalesce((select array_agg(value) from jsonb_array_elements_text(p_payload->'times')), '{}'),
    email    = nullif(p_payload->>'email',''),
    sns      = nullif(p_payload->>'sns',''),
    bio      = nullif(p_payload->>'bio',''),
    notes    = nullif(p_payload->>'notes','')
  where id = p_id;
end;
$$;

-- 削除（トークン一致時のみ）
create or replace function public.delete_member(p_id uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.member_edit_tokens
                 where member_id = p_id and token = p_token) then
    raise exception 'invalid edit token';
  end if;
  delete from public.members where id = p_id;
end;
$$;

-- anon からRPC実行を許可（関数内でトークン照合するので安全）
grant execute on function public.register_member(jsonb, uuid)     to anon;
grant execute on function public.get_member_for_edit(uuid, uuid)  to anon;
grant execute on function public.update_member(uuid, uuid, jsonb) to anon;
grant execute on function public.delete_member(uuid, uuid)        to anon;
