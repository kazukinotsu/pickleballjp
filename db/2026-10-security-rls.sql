-- ============================================================================
-- Picklejp — security hardening (2026-10)
-- Supabase Dashboard > SQL Editor に貼り付けて Run。冪等（何度実行してもOK）。
--
-- 1. anon による members への「直接 INSERT」を禁止する。
--    フロントは register_member() RPC 経由でしか登録しないため機能影響なし。
--    直接 INSERT だと is_published / created_at / id を任意指定でき、
--    編集トークンも作られない（=削除不能なスパム行）ため閉じる。
-- 2. members に CHECK 制約を追加し、level / days / times を既知の値に限定、
--    各テキスト列と venues の長さを制限する（保存型XSS・巨大ペイロード対策）。
--    既存行の検証はスキップ（NOT VALID）＝新規の INSERT/UPDATE にのみ適用。
-- 3. SECURITY DEFINER 関数の EXECUTE を PUBLIC から剥がし、anon/authenticated
--    にのみ明示付与。member_edit_tokens への直接権限も剥奪。
-- ============================================================================

-- ---------- 1. direct INSERT を閉じる ----------
drop policy if exists "Public insert" on public.members;
revoke insert, update, delete, truncate on public.members from anon, authenticated;

-- ---------- 2. 値の制約 ----------
alter table public.members drop constraint if exists members_level_chk;
alter table public.members add constraint members_level_chk
  check (level is null or level in ('beginner','intermediate','advanced')) not valid;

alter table public.members drop constraint if exists members_days_chk;
alter table public.members add constraint members_days_chk
  check (days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]) not valid;

alter table public.members drop constraint if exists members_times_chk;
alter table public.members add constraint members_times_chk
  check (times <@ array['morning','day','evening','night']::text[]) not valid;

alter table public.members drop constraint if exists members_len_chk;
alter table public.members add constraint members_len_chk check (
      char_length(name) between 1 and 80
  and coalesce(char_length(location),0) <= 200
  and coalesce(char_length(country),0)  <= 80
  and coalesce(char_length(email),0)    <= 254
  and coalesce(char_length(sns),0)      <= 200
  and coalesce(char_length(bio),0)      <= 1000
  and coalesce(char_length(notes),0)    <= 2000
  and (lat is null or lat between -90 and 90)
  and (lng is null or lng between -180 and 180)
) not valid;

alter table public.members drop constraint if exists members_venues_chk;
alter table public.members add constraint members_venues_chk check (
  venues is null or (jsonb_typeof(venues) = 'array'
                     and jsonb_array_length(venues) <= 20
                     and pg_column_size(venues) <= 16384)
) not valid;

-- ---------- 3. 関数・トークン表の権限 ----------
revoke all on table public.member_edit_tokens from anon, authenticated;

revoke execute on function public.register_member(jsonb, uuid)     from public;
revoke execute on function public.get_member_for_edit(uuid, uuid)  from public;
revoke execute on function public.update_member(uuid, uuid, jsonb) from public;
revoke execute on function public.delete_member(uuid, uuid)        from public;
grant  execute on function public.register_member(jsonb, uuid)     to anon, authenticated;
grant  execute on function public.get_member_for_edit(uuid, uuid)  to anon, authenticated;
grant  execute on function public.update_member(uuid, uuid, jsonb) to anon, authenticated;
grant  execute on function public.delete_member(uuid, uuid)        to anon, authenticated;

-- 確認用: 既存行で新制約に違反しているものがあれば一覧表示（0行なら validate 可能）
-- select id, name, level, days, times from public.members
--  where not (level is null or level in ('beginner','intermediate','advanced'))
--     or not (days  <@ array['mon','tue','wed','thu','fri','sat','sun']::text[])
--     or not (times <@ array['morning','day','evening','night']::text[]);
-- 問題なければ:
-- alter table public.members validate constraint members_level_chk;
-- alter table public.members validate constraint members_days_chk;
-- alter table public.members validate constraint members_times_chk;
