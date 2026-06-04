-- ============================================================================
-- Picklejp — 本人編集機能（編集トークン）
-- Supabase Dashboard > SQL Editor に貼り付けて Run。
-- ============================================================================

-- トークン保管テーブル（anonからは直接読めない: RLS有効・ポリシー無し）
create table if not exists public.member_edit_tokens (
  member_id uuid primary key references public.members(id) on delete cascade,
  token     uuid not null
);
alter table public.member_edit_tokens enable row level security;
-- ポリシーを作らない = anon/authenticated は直接 select/insert/update/delete 不可

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
