# Picklejp Community Map — 引き継ぎ修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の Picklejp Community Map に4つの修正（本人編集URL・モバイル整形・地図全体表示・Google Places検索）を加える。

**Architecture:** バニラJS単一HTML（`index.html`）+ Supabase。地図はLeaflet。DB変更は別SQLとしてユーザーがSupabase Dashboardで実行。場所検索は「プロバイダ抽象」を導入しNominatim↔Google Placesを切替。

**Tech Stack:** HTML/CSS/Vanilla JS, Supabase JS v2 + Postgres RPC (SECURITY DEFINER), Leaflet 1.9.4, Google Maps JS API (Places).

> **テスト方針:** 本プロジェクトは意図的にビルド/テストハーネスを持たない単一HTMLプロトタイプ。各タスクの検証は (a) `npm start` でローカル起動しブラウザで操作確認、(b) DB部分は Supabase SQL Editor での確認、とする。自動テストは導入しない（YAGNI・既存規約準拠）。
>
> **設計ドキュメント:** `docs/superpowers/specs/2026-06-03-picklejp-revisions-design.md`

---

## File Structure

- `index.html` — 全フロント実装。③地図、②CSS、④Places、①編集を追記/改修。
- `config.js` / `config.example.js` — Googleキー（**追加済み**）。
- `supabase-schema.sql` — 参照スキーマに `member_edit_tokens` + RPC を追記（ドキュメント用）。
- `db/2026-06-03-edit-feature.sql` — **新規**。ユーザーがDashboardで実行する実マイグレーション。

---

## Task 0: フィーチャーブランチ作成

**Files:** なし（git操作のみ）

- [ ] **Step 1: ブランチ作成**

```bash
cd /Users/kazukinotsu/pickleballjp
git checkout -b feature/handover-revisions
git status
```

Expected: `On branch feature/handover-revisions`

---

## Task 1: ③ 世界地図を一度に全体表示（fit-to-bounds）

**Files:**
- Modify: `index.html`（`initMap` と `renderMapMarkers` 周辺、概ね 1187-1247 行）

- [ ] **Step 1: `fitMapToMarkers` ヘルパーを追加し `initMap` から呼ぶ**

`index.html` の `function initMap(){ ... }` を以下に置き換える:

```js
function initMap(){
  if (!window.L) return;
  if (!mapInstance){
    mapInstance = L.map("map", {
      center: [25, 135],
      zoom: 2,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(mapInstance);
    mapMarkerLayer = L.layerGroup().addTo(mapInstance);
  }
  renderMapMarkers();
  // 表示確定後にサイズ補正 → 全ピンが収まるよう自動ズーム
  setTimeout(() => { mapInstance.invalidateSize(); fitMapToMarkers(); }, 120);
}

function fitMapToMarkers(){
  if (!mapInstance) return;
  const pts = members
    .filter(m => m.lat != null && m.lng != null)
    .map(m => [m.lat, m.lng]);
  if (pts.length >= 1){
    mapInstance.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 6 });
  } else {
    mapInstance.setView([25, 135], 2);
  }
}
```

- [ ] **Step 2: ローカル起動して目視確認**

```bash
npm start
```
ブラウザで `http://localhost:3000` → 「世界マップ」タブ。
Expected: 開いた瞬間に全メンバーのピン（日本・ハワイ・SF・LA・シンガポール・ブラジル）が**1画面に収まって**表示される。1地点のみの場合もズームしすぎない（maxZoom 6）。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(map): fit world map to all member markers on open"
```

---

## Task 2: ② モバイルのレイアウト/改行修正

**Files:**
- Modify: `index.html`（`<style>` 内、既存メディアクエリ `@media (max-width: 740px)` / `860px` の近く、概ね 100-124 行付近に追記）

- [ ] **Step 1: 狭幅向けメディアクエリを追加**

`index.html` の `<style>` 末尾（`</style>` の直前、Mapセクションの後）に追記:

```css
  /* ===== Mobile refinements ===== */
  @media (max-width: 560px){
    .wrap { padding: 16px 12px 90px; }
    header.hero { padding: 14px 14px; gap: 12px; }
    .brand { font-size: 16px; }
    .brand small { font-size: 11px; }
    .ball { width: 28px; height: 28px; }
    header.hero > div { width: 100%; justify-content: space-between; }
    .tabs { flex: 1; justify-content: space-between; }
    .tab { padding: 8px 9px; font-size: 12px; }
    .card { padding: 18px; }
    .card h1 { font-size: 22px; line-height: 1.25; }
    .stat .num { font-size: 19px; }
    .stat .lbl { font-size: 10px; letter-spacing: .3px; }
    #map { height: 62vh; }
    .filters.card { gap: 8px; }
    .filters input, .filters select { max-width: 100% !important; flex: 1 1 100%; }
  }
  @media (max-width: 380px){
    .tab { padding: 7px 7px; font-size: 11px; }
    .langsw button { padding: 6px 8px; }
  }
```

- [ ] **Step 2: モバイル幅で目視確認（375px / 414px）**

`npm start` 起動済みのブラウザのデバイスツールバーで幅 375px と 414px を確認。各タブ（訪問地・世界マップ・メンバー一覧・登録する）を開く。
Expected: ヘッダーのロゴ/タブ/言語切替が崩れず折り返す。見出し `h1` が極端に改行されない。統計3カードが潰れない。フォーム入力が画面幅に収まる。メンバーカードが1カラムで読める。崩れが残る箇所があればこのStepで該当セレクタの値を微調整する。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix(mobile): tidy header/tabs/stats/forms layout on small screens"
```

---

## Task 3: ④-a 場所検索を「プロバイダ抽象」にリファクタ（挙動不変・Nominatimのまま）

このタスクは挙動を変えずに `AutoComplete` を `suggest`/`resolve` インターフェース化する準備。

**Files:**
- Modify: `index.html`（`AutoComplete` クラス 963-1022 行、`nominatimSearch`/`extractPlaceParts` 931-961 行、ACインスタンス生成 1448-1468 行）

- [ ] **Step 1: Nominatimプロバイダを追加（既存関数を再利用）**

`index.html` の `extractPlaceParts(...)` 関数定義の直後に追記:

```js
/* =================== Place provider abstraction =================== */
// 各プロバイダは2メソッドを持つ:
//   suggest(query) -> [{ id, name, full, _resolved? }]
//   resolve(item)  -> { name, full, country, lat, lng }
function nominatimProvider(){
  return {
    async suggest(q){
      const results = await nominatimSearch(q);
      return results.map(r => {
        const p = extractPlaceParts(r);
        return { id: null, name: p.name, full: p.full, _resolved: p };
      });
    },
    async resolve(item){ return item._resolved; }
  };
}
```

- [ ] **Step 2: `AutoComplete` を provider 経由に変更**

`AutoComplete` クラス内の `onInput()` と `render(items)` を以下に置き換える（コンストラクタは `this.provider = provider;` を受け取る形に変更）:

```js
class AutoComplete {
  constructor(inputId, listId, onSelect, provider) {
    this.input = document.getElementById(inputId);
    this.list = document.getElementById(listId);
    this.onSelect = onSelect;
    this.provider = provider;
    this.timer = null;
    this.lastQuery = "";
    this.input.addEventListener("input", () => this.onInput());
    this.input.addEventListener("focus", () => { if (this.list.innerHTML) this.show(); });
    this.input.addEventListener("blur", () => setTimeout(() => this.hide(), 200));
    this.input.addEventListener("keydown", (e) => { if (e.key === "Escape") this.hide(); });
  }
  setValue(v){ this.input.value = v; }
  clear(){ this.input.value = ""; this.list.innerHTML=""; this.hide(); }
  show(){ this.list.hidden = false; }
  hide(){ this.list.hidden = true; }

  onInput() {
    const q = this.input.value.trim();
    if (q.length < 2) { this.hide(); return; }
    clearTimeout(this.timer);
    this.list.innerHTML = `<div class="ac-status">${lang==="ja"?"検索中…":"Searching…"}</div>`;
    this.show();
    this.timer = setTimeout(async () => {
      if (this.lastQuery === q) return;
      this.lastQuery = q;
      try {
        const items = await this.provider.suggest(q);
        this.render(items);
      } catch(e){
        this.list.innerHTML = `<div class="ac-status err">${
          lang==="ja" ? "検索できません。そのまま手入力できます。"
                      : "Search unavailable — you can type freely."
        }</div>`;
      }
    }, 380);
  }
  render(items){
    if (!items.length){
      this.list.innerHTML = `<div class="ac-status">${lang==="ja"?"候補がありません":"No results"}</div>`;
      return;
    }
    this.list.innerHTML = items.map((p,i) => `
      <div class="ac-item" data-i="${i}">
        <div class="t">${escapeHtml(p.name)}</div>
        <div class="s">${escapeHtml(p.full)}</div>
      </div>`).join("");
    this.list.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        const i = parseInt(el.dataset.i, 10);
        this.hide();
        try {
          const resolved = await this.provider.resolve(items[i]);
          if (resolved) this.onSelect(resolved);
        } catch(err){
          toast(lang==="ja" ? "場所の取得に失敗しました" : "Couldn't load that place");
        }
      });
    });
  }
}
```

- [ ] **Step 3: プロバイダを選択し各ACに渡す**

ACインスタンス生成箇所（`const visitAC = new AutoComplete(...)` の直前）に追加し、3つの生成に `placeProvider` を渡す:

```js
const placeProvider = nominatimProvider(); // ④-bでGoogle対応に差し替え
```

そして3箇所を更新:

```js
const visitAC = new AutoComplete("visitInput", "visitAC", (p)=>{
  visitOrigin = { name: p.full || p.name, lat: p.lat, lng: p.lng };
  document.getElementById("visitInput").value = p.full || p.name;
  renderVisitResults();
}, placeProvider);

const locAC = new AutoComplete("locInput", "locAC", (p)=>{
  pickedLocation = p;
  document.getElementById("locInput").value = p.full || p.name;
}, placeProvider);

const venueAC = new AutoComplete("venueInput", "venueAC", (p)=>{
  pickedVenues.push({ name: p.name, full: p.full, lat: p.lat, lng: p.lng });
  renderVenueChips();
  document.getElementById("venueInput").value = "";
}, placeProvider);
```

- [ ] **Step 4: 目視確認（挙動不変）**

`npm start` のブラウザで「登録する」タブ → 居住地/会場の入力で候補が出て選択でき、従来通り動くこと（まだNominatim）。
Expected: リファクタ前と同じ動作。

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor(search): introduce place-provider abstraction (nominatim unchanged)"
```

---

## Task 4: ④-b Google Places プロバイダを追加して有効化

**Files:**
- Modify: `index.html`（`HAS_SUPABASE` 定義の近く 797-805 行にフラグ追加、`nominatimProvider` の隣にローダ+`googleProvider`、`placeProvider` 選択行）

- [ ] **Step 1: Googleフラグとローダを追加**

`const HAS_SUPABASE = ...` ブロックの直後に追記:

```js
const HAS_GMAPS =
  typeof window.GOOGLE_MAPS_API_KEY === "string" &&
  window.GOOGLE_MAPS_API_KEY.length > 10 &&
  !/YOUR_GOOGLE/i.test(window.GOOGLE_MAPS_API_KEY);

let _gmapsPromise = null;
function loadGoogleMaps(){
  if (!HAS_GMAPS) return Promise.reject(new Error("no google maps key"));
  if (_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" +
            encodeURIComponent(window.GOOGLE_MAPS_API_KEY) +
            "&libraries=places&language=" + (lang === "ja" ? "ja" : "en");
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("google maps load failed"));
    document.head.appendChild(s);
  });
  return _gmapsPromise;
}
```

- [ ] **Step 2: `googleProvider` を追加**

`nominatimProvider()` 関数の直後に追記:

```js
function googleProvider(){
  let svc = null, places = null, sessionToken = null;
  async function ensure(){
    await loadGoogleMaps();
    if (!svc){
      svc = new google.maps.places.AutocompleteService();
      places = new google.maps.places.PlacesService(document.createElement("div"));
    }
  }
  return {
    async suggest(q){
      await ensure();
      if (!sessionToken) sessionToken = new google.maps.places.AutocompleteSessionToken();
      return new Promise((resolve) => {
        svc.getPlacePredictions({ input: q, sessionToken }, (preds, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !preds){ resolve([]); return; }
          resolve(preds.map(p => ({
            id: p.place_id,
            name: (p.structured_formatting && p.structured_formatting.main_text) || p.description,
            full: p.description
          })));
        });
      });
    },
    async resolve(item){
      await ensure();
      return new Promise((resolve, reject) => {
        places.getDetails({
          placeId: item.id,
          fields: ["geometry", "formatted_address", "name", "address_components"],
          sessionToken
        }, (place, status) => {
          sessionToken = null; // セッション終了（課金最適化）
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !place.geometry){
            reject(new Error("details failed")); return;
          }
          const country = (place.address_components || [])
            .find(c => c.types.includes("country"));
          resolve({
            name: place.name || item.name,
            full: place.formatted_address || item.full,
            country: country ? country.long_name : "",
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
          });
        });
      });
    }
  };
}
```

- [ ] **Step 3: プロバイダ選択を切替**

Task 3 Step 3 で入れた行を変更:

```js
const placeProvider = HAS_GMAPS ? googleProvider() : nominatimProvider();
```

- [ ] **Step 4: 施設名検索を目視確認**

`npm start`。**注意:** Googleキーのリファラ制限に `http://localhost:3000/*` が含まれていること（含まれないとローカルで弾かれる）。
「登録する」→ 会場入力に `The HUB Silicon Valley` と入力。
Expected: Googleの候補が出る → 選択すると会場チップに追加され、座標が取れている（後続の地図/距離で機能）。`The Pickle Bang Theory` でも候補が出る。キーが無効な場合はNominatimにフォールバックして壊れない。

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(search): use Google Places for venue/location autocomplete with nominatim fallback"
```

---

## Task 5: ①-DB 編集用トークンの保存先とRPCを定義（実行用SQL）

**Files:**
- Create: `db/2026-06-03-edit-feature.sql`
- Modify: `supabase-schema.sql`（参照用に同内容を末尾追記）

- [ ] **Step 1: マイグレーションSQLを作成**

`db/2026-06-03-edit-feature.sql` を新規作成:

```sql
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
```

- [ ] **Step 2: 参照スキーマにも追記**

`supabase-schema.sql` の末尾に、上記SQLと同じ内容をコメント `-- ---------- Edit feature (run db/2026-06-03-edit-feature.sql) ----------` を付けて追記する（ドキュメント整合のため）。

- [ ] **Step 3: ユーザーがSupabaseで実行（手動・このStepは確認のみ）**

> **ユーザー作業:** `db/2026-06-03-edit-feature.sql` を Supabase Dashboard > SQL Editor に貼って Run。「Success. No rows returned.」を確認。
> 確認クエリ: `select proname from pg_proc where proname in ('register_member','get_member_for_edit','update_member','delete_member');` が4行返ること。

- [ ] **Step 4: Commit**

```bash
git add db/2026-06-03-edit-feature.sql supabase-schema.sql
git commit -m "feat(db): add edit-token table and SECURITY DEFINER RPCs for self-edit"
```

---

## Task 6: ①-FE 登録をRPC化し、編集URLをモーダルで発行

**Files:**
- Modify: `index.html`（`saveMember` 845-865 行、`handleSubmit` の成功処理 1321-1337 行、成功モーダル用のDOM+CSS追加、`State` に `editing` 追加）

- [ ] **Step 1: editing状態とトークン生成ユーティリティ**

`/* =================== State =================== */` ブロックに追加:

```js
let editing = null; // 編集モード時 { id, token }
```

`cryptoRandom()` の近くに追加（標準APIがあれば利用）:

```js
function newEditToken(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  // フォールバック（古環境）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x'? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
```

- [ ] **Step 2: `saveMember` をRPC（register_member）に変更**

`async function saveMember(m){ ... }` を以下に置き換える:

```js
async function saveMember(m){
  const token = newEditToken();
  if (sb){
    const { data, error } = await sb.rpc("register_member", {
      p_payload: {
        name: m.name, location: m.location,
        lat: m.lat ?? null, lng: m.lng ?? null, country: m.country || null,
        level: m.level, venues: m.venues || [],
        days: m.days || [], times: m.times || [],
        email: m.email || null, sns: m.sns || null,
        bio: m.bio || null, notes: m.notes || null
      },
      p_token: token
    });
    if (error) throw error;
    const newId = data; // returns uuid
    return { ...m, id: newId, edit_token: token, created_at: new Date().toISOString() };
  }
  // Local fallback（トークンも保持して編集できるように）
  const full = {...m, id: cryptoRandom(), edit_token: token, created_at: new Date().toISOString()};
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  existing.unshift(full);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(existing)); } catch(e){}
  return full;
}
```

- [ ] **Step 3: 編集URLモーダルのDOM + CSSを追加**

`<div class="toast" id="toast"></div>` の直後に追加:

```html
<div id="editLinkModal" style="display:none; position:fixed; inset:0; z-index:1000;
     background:rgba(0,0,0,.6); align-items:center; justify-content:center; padding:20px;">
  <div style="background:#0d1330; border:1px solid var(--line); border-radius:16px;
       max-width:520px; width:100%; padding:24px; box-shadow:var(--shadow);">
    <div style="font-weight:800; font-size:17px; margin-bottom:6px;"
         data-ja="登録ありがとうございます！🎉" data-en="Thanks for joining! 🎉">登録ありがとうございます！🎉</div>
    <div style="color:var(--muted); font-size:13px; margin-bottom:14px;"
         data-ja="このURLを保存してください。あとで自分のエントリーを編集・削除できます（あなただけのリンクです）。"
         data-en="Save this URL. You can edit or delete your entry later (this link is private to you).">
      このURLを保存してください。あとで自分のエントリーを編集・削除できます（あなただけのリンクです）。
    </div>
    <div style="display:flex; gap:8px;">
      <input type="text" id="editLinkInput" readonly style="flex:1; font-size:12.5px;" />
      <button class="btn" id="editLinkCopy" data-ja="コピー" data-en="Copy">コピー</button>
    </div>
    <div style="text-align:right; margin-top:16px;">
      <button class="btn secondary" id="editLinkClose" data-ja="閉じる" data-en="Close">閉じる</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: モーダル表示関数と配線**

`/* =================== Toast =================== */` の近くに追加:

```js
function showEditLinkModal(id, token){
  const base = location.origin + location.pathname;
  const url = `${base}?edit=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
  document.getElementById("editLinkInput").value = url;
  document.getElementById("editLinkModal").style.display = "flex";
}
document.getElementById("editLinkClose").addEventListener("click", () => {
  document.getElementById("editLinkModal").style.display = "none";
});
document.getElementById("editLinkCopy").addEventListener("click", async () => {
  const inp = document.getElementById("editLinkInput");
  try { await navigator.clipboard.writeText(inp.value); }
  catch(e){ inp.select(); document.execCommand("copy"); }
  toast(lang==="ja" ? "URLをコピーしました" : "URL copied");
});
```

- [ ] **Step 5: 登録成功時にモーダルを出す**

`handleSubmit` の成功ブロック内（`toast(... "登録ありがとうございます！" ...)` の行）を、編集モードでない新規登録時はモーダル表示に変更する。該当の `try { const saved = await saveMember(m); ... }` 成功処理のうち、新規登録パスで:

```js
    const saved = await saveMember(m);
    members.unshift(saved);
    form.reset();
    pickedLocation = null;
    pickedVenues = [];
    selectedDays.clear(); selectedTimes.clear();
    document.getElementById("locInput").value = "";
    document.getElementById("venueInput").value = "";
    document.querySelectorAll("#daysChips .chip,#timeChips .chip").forEach(c=>c.classList.remove("on"));
    renderVenueChips();
    showTab("browse");
    populateCountryFilter();
    renderList();
    if (mapInstance) renderMapMarkers();
    showEditLinkModal(saved.id, saved.edit_token);
```

（`toast("登録ありがとうございます…")` はモーダルに役割を移すため削除。）

- [ ] **Step 6: 目視確認（登録 → URL発行）**

Supabaseのマイグレーション（Task 5 Step 3）実行済み前提で `npm start`。新規登録を1件行う。
Expected: 登録後にモーダルが出て `?edit=<uuid>&token=<uuid>` 形式のURLが表示され、コピーできる。Supabase Table Editor で `members` に1件、`member_edit_tokens` に対応行が増えている。

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(edit): register via RPC and issue private edit-link modal"
```

---

## Task 7: ①-FE 編集モード（プリフィル・更新・削除）

**Files:**
- Modify: `index.html`（`handleSubmit` を更新分岐対応、初期化IIFE 1474-1485 行に編集URL検出、フォームに削除ボタン、`applyLang`/ボタンラベル切替）

- [ ] **Step 1: 編集URL検出 → プリフィル関数**

初期化IIFE（`(async () => { members = await loadMembers(); ... })();`）の `renderList()` などの後、`if (!HAS_SUPABASE){...}` の前に挿入する処理として、まず関数を `handleGeolocation` 付近に定義:

```js
function fillFormForEdit(m){
  const form = document.getElementById("joinForm");
  form.elements["name"].value  = m.name || "";
  form.elements["level"].value = m.level || "";
  form.elements["email"].value = m.email || "";
  form.elements["sns"].value   = m.sns || "";
  form.elements["bio"].value   = m.bio || "";
  form.elements["notes"].value = m.notes || "";
  pickedLocation = (m.lat != null && m.lng != null)
    ? { name: m.location, full: m.location, country: m.country || "", lat: m.lat, lng: m.lng }
    : null;
  document.getElementById("locInput").value = m.location || "";
  pickedVenues = (m.venues || []).slice();
  renderVenueChips();
  selectedDays = new Set(m.days || []);
  selectedTimes = new Set(m.times || []);
  document.querySelectorAll("#daysChips .chip").forEach(c=>c.classList.toggle("on", selectedDays.has(c.dataset.val)));
  document.querySelectorAll("#timeChips .chip").forEach(c=>c.classList.toggle("on", selectedTimes.has(c.dataset.val)));
  // ボタンラベル＆削除ボタン
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.textContent = lang==="ja" ? "更新する" : "Update";
  document.getElementById("btnDelete").style.display = "";
  showTab("join");
  toast(lang==="ja" ? "編集モードです" : "Editing your entry");
}

async function loadEditFromUrl(){
  const params = new URLSearchParams(location.search);
  const id = params.get("edit");
  const token = params.get("token");
  if (!id || !token) return;
  try {
    if (sb){
      const { data, error } = await sb.rpc("get_member_for_edit", { p_id: id, p_token: token });
      if (error) throw error;
      const m = Array.isArray(data) ? data[0] : data;
      if (!m){ toast(lang==="ja"?"編集リンクが無効です":"Invalid edit link"); return; }
      editing = { id, token };
      fillFormForEdit({ ...m, days: m.days||[], times: m.times||[], venues: m.venues||[] });
    } else {
      const local = (JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"))
        .find(x => x.id === id && x.edit_token === token);
      if (!local){ toast(lang==="ja"?"編集リンクが無効です":"Invalid edit link"); return; }
      editing = { id, token };
      fillFormForEdit(local);
    }
  } catch(e){
    console.error(e);
    toast(lang==="ja" ? "編集データを取得できませんでした" : "Couldn't load edit data");
  }
}
```

- [ ] **Step 2: 削除ボタンをフォームに追加**

`joinForm` の送信ボタン群（`<button type="submit" ...>コミュニティに登録する</button>` のある `div.full` ）に削除ボタンを追加（初期非表示）:

```html
          <button type="button" class="btn" id="btnDelete" style="display:none; background:var(--danger); color:#1a0606;"
            data-ja="このエントリーを削除" data-en="Delete this entry">このエントリーを削除</button>
```

- [ ] **Step 3: `handleSubmit` を更新分岐対応に**

`handleSubmit` の保存部分（`const saved = await saveMember(m);` を含む try ブロック）を、編集中は更新するよう分岐:

```js
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if (editing){
      if (sb){
        const { error } = await sb.rpc("update_member", {
          p_id: editing.id, p_token: editing.token,
          p_payload: {
            name: m.name, location: m.location,
            lat: m.lat ?? null, lng: m.lng ?? null, country: m.country || null,
            level: m.level, venues: m.venues || [],
            days: m.days || [], times: m.times || [],
            email: m.email || null, sns: m.sns || null,
            bio: m.bio || null, notes: m.notes || null
          }
        });
        if (error) throw error;
      } else {
        const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const idx = arr.findIndex(x => x.id === editing.id);
        if (idx >= 0){ arr[idx] = { ...arr[idx], ...m }; localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
      }
      const idx = members.findIndex(x => x.id === editing.id);
      if (idx >= 0) members[idx] = { ...members[idx], ...m };
      finishEdit();
      toast(lang==="ja" ? "更新しました ✅" : "Updated ✅");
      showTab("browse");
      populateCountryFilter(); renderList();
      if (mapInstance) renderMapMarkers();
    } else {
      const saved = await saveMember(m);
      members.unshift(saved);
      resetJoinForm();
      showTab("browse");
      populateCountryFilter(); renderList();
      if (mapInstance) renderMapMarkers();
      showEditLinkModal(saved.id, saved.edit_token);
    }
  } catch(err){
    console.error(err);
    toast(lang==="ja" ? "保存できませんでした。時間をおいてお試しください。" : "Couldn't save. Please try again.");
  } finally {
    submitBtn.disabled = false;
  }
```

そして共通化のため、フォームリセットを2つの関数に切り出して `handleSubmit` の上に定義:

```js
function resetJoinForm(){
  const form = document.getElementById("joinForm");
  form.reset();
  pickedLocation = null; pickedVenues = [];
  selectedDays.clear(); selectedTimes.clear();
  document.getElementById("locInput").value = "";
  document.getElementById("venueInput").value = "";
  document.querySelectorAll("#daysChips .chip,#timeChips .chip").forEach(c=>c.classList.remove("on"));
  renderVenueChips();
}
function finishEdit(){
  editing = null;
  const form = document.getElementById("joinForm");
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.textContent = lang==="ja" ? "コミュニティに登録する" : "Register to community";
  document.getElementById("btnDelete").style.display = "none";
  resetJoinForm();
  // URLからedit/tokenを除去
  history.replaceState({}, "", location.origin + location.pathname);
}
```

- [ ] **Step 4: 削除ボタンの配線**

`document.getElementById("joinForm").addEventListener("submit", handleSubmit);` の近くに追加:

```js
document.getElementById("btnDelete").addEventListener("click", async () => {
  if (!editing) return;
  if (!confirm(lang==="ja" ? "このエントリーを削除しますか？元に戻せません。" : "Delete this entry? This cannot be undone.")) return;
  try {
    if (sb){
      const { error } = await sb.rpc("delete_member", { p_id: editing.id, p_token: editing.token });
      if (error) throw error;
    } else {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").filter(x => x.id !== editing.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    }
    members = members.filter(x => x.id !== editing.id);
    finishEdit();
    toast(lang==="ja" ? "削除しました" : "Deleted");
    showTab("browse");
    populateCountryFilter(); renderList();
    if (mapInstance) renderMapMarkers();
  } catch(e){
    console.error(e);
    toast(lang==="ja" ? "削除できませんでした" : "Couldn't delete");
  }
});
```

- [ ] **Step 5: 初期化で編集URLを処理**

初期化IIFE の末尾（`if (!HAS_SUPABASE){...}` の後）に追加:

```js
  await loadEditFromUrl();
```

- [ ] **Step 6: 目視確認（編集・削除の一連）**

`npm start`。Task 6で発行された編集URLを別タブで開く。
Expected:
1. フォームに既存値がプリフィルされ、ボタンが「更新する」+「削除」になる。
2. 値を変えて「更新する」→ メンバー一覧に反映、Supabaseでも更新されている。
3. 別の正しい編集URLで「削除」→ 一覧と地図から消え、Supabaseの `members` から削除される。
4. **トークンを改ざんしたURL**（token末尾を1文字変更）で開く → 「編集リンクが無効です」。Supabaseで他人のデータが取得/更新/削除できないこと（RPCが `invalid edit token` を返す）。

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(edit): edit-mode prefill, update, and delete via token-checked RPCs"
```

---

## Task 8: 仕上げ（ドキュメント追記 + 通し確認）

**Files:**
- Modify: `README.md`（編集機能とGoogleキーの一文を追記）

- [ ] **Step 1: READMEに運用メモを追記**

`README.md` に以下のセクションを追記:

```markdown
## 編集機能（本人用）
登録完了時に「編集用URL」（`?edit=<id>&token=<token>`）が発行されます。本人はこのURLから自分のエントリーを編集・削除できます。DBは `db/2026-06-03-edit-feature.sql` を Supabase の SQL Editor で実行して有効化します。

## 場所検索（Google Places）
`config.js` の `GOOGLE_MAPS_API_KEY` を設定すると施設名検索（Places API）になります。未設定時は OpenStreetMap (Nominatim) にフォールバックします。キーは Google Cloud Console で HTTPリファラー制限 + API制限（Places/Geocoding）をかけてください。
```

- [ ] **Step 2: 通し目視確認（4機能の回帰チェック）**

`npm start` で以下を一通り確認:
- ③ 世界マップが全ピン収まって開く
- ② 375px幅で全タブのレイアウトが崩れない
- ④ 施設名（The HUB Silicon Valley 等）が検索できる
- ① 登録→URL発行→編集→削除→不正トークン拒否

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: note self-edit flow and Google Places setup"
```

- [ ] **Step 4: ブランチ確認（pushはユーザー判断）**

```bash
git log --oneline feature/handover-revisions -12
```
> push / PR作成はユーザーの指示を待つ（勝手にpushしない）。

---

## Self-Review メモ
- **Spec coverage:** ①=Task5/6/7、②=Task2、③=Task1、④=Task3/4。全項目に対応タスクあり。
- **依存順:** ④抽象(Task3)→Google(Task4)→DB(Task5)→登録FE(Task6)→編集FE(Task7)。Task6/7はTask5のSQL実行が前提。
- **型整合:** プロバイダは全て `{name,full,country,lat,lng}` を返す。RPC名 `register_member/get_member_for_edit/update_member/delete_member` はDBとFEで一致。`finishEdit/resetJoinForm/showEditLinkModal/fitMapToMarkers` は定義箇所と呼出箇所が整合。
