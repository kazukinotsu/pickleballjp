# Picklejp Community Map — 引き継ぎ修正 設計ドキュメント

- **日付**: 2026-06-03
- **対象リポジトリ**: `kazukinotsu/pickleballjp`（単一HTML + Supabase + Leaflet）
- **担当**: Kazuki Notsu（引き継ぎ）

## 背景

既存の Picklejp Community Map に対し、引き継ぎに伴う4つの修正を行う。アプリは
`index.html` 単一ファイル構成（バニラJS/CSS）、データは Supabase（`members` テーブル
+ RLS）、地図は Leaflet。場所検索は現在 OpenStreetMap (Nominatim)。

## スコープ（4点）

1. 登録情報を**本人が**修正・削除できる（編集URLトークン方式）
2. モバイルのレイアウト/改行崩れの修正
3. 世界地図を開いた時に全メンバーが一度に見える表示
4. 会場・場所検索を **Google Places API** に切り替え（施設名でヒットするように）

管理者の編集は従来どおり Supabase Dashboard を使う（サイト内管理画面は作らない）。

---

## ① 本人による編集（編集URLトークン方式）

### 要件
- 登録完了時に「あなたの編集用URL」を発行し、コピーボタン付きで表示する。
- そのURLを持つ本人だけが自分のエントリーを**編集・削除**できる。
- トークンは第三者に漏れない設計にする（公開SELECTから除外）。

### データモデル
`members` に列を追加:
- `edit_token uuid`（クライアントが `crypto.randomUUID()` で生成し登録時に保存）

トークンは**公開SELECTで返さない**。`anon` ロールに対し `edit_token` 列の
SELECT 権限を与えない（または別方式で隠す）。アプリの読み取りは明示カラム指定にする。

### セキュリティ設計（RPC経由）
anon に直接 UPDATE/DELETE 権限は与えない。トークン照合は Postgres の
`SECURITY DEFINER` 関数で行う:

- `get_member_for_edit(p_id uuid, p_token uuid) returns members`
  - `id = p_id AND edit_token = p_token` の行のみ返す（編集フォームのプリフィル用）
- `update_member(p_id uuid, p_token uuid, p_payload jsonb) returns void`
  - トークン一致時のみ編集可能フィールドを更新
- `delete_member(p_id uuid, p_token uuid) returns void`
  - トークン一致時のみ削除

`edit_token` のクライアント生成により、登録直後に読み戻し不要でURLを組める
（`?edit=<id>&token=<token>`）。

### フロント挙動
- 起動時に URL の `?edit=&token=` を検出 → `get_member_for_edit` で取得 →
  「登録する」フォームにプリフィルし、ボタンを「更新する」「削除する」に変更。
- 更新/削除は対応RPCを呼ぶ。完了でトースト表示し一覧へ。
- 既存メンバー（移行で `edit_token` が自動採番される）は本人がトークンを知らない。
  必要時は管理者が Dashboard で確認する想定（今回のスコープ外の運用対応）。

### マイグレーション
SQL（列追加・列権限・RPC関数）を用意し、**Kazuki が Supabase Dashboard の
SQL Editor で実行**する（Claude は DB に直接アクセス不可）。

---

## ② モバイルのレイアウト/改行修正

### 要件
スマホ幅（〜375px 程度）でヘッダー・タブ・統計・フォーム・メンバーカードの
折り返しや改行が崩れないようにする。

### 方針
- 既存ブレークポイント（740px / 860px）を活かしつつ、狭幅向けの追加調整。
- 想定対象: `header.hero`（ロゴ＋タブ＋言語切替の折り返し）、`.tabs`（4タブの
  はみ出し）、`.stats`（3列が潰れる）、`.card h1`（見出しの折り返し）、
  メンバーカードグリッド幅。
- 実機相当（375px / 414px）で表示確認してから個別修正。視認による検証を行う。

---

## ③ 世界地図を一度に全体表示

### 要件
「世界マップ」タブを開いた時、全メンバーのピンが一画面に収まる。

### 方針
- マーカー描画後に `map.fitBounds(markerBounds, { padding })` で自動ズーム。
- メンバーが0〜1人の時に寄りすぎないよう `maxZoom` を設定し、空時は従来の
  ワールドビューにフォールバック。
- `invalidateSize()` は既存どおり表示後に呼ぶ（タブ切替時の描画崩れ対策）。

---

## ④ Google Places への切り替え

### 要件
「The HUB Silicon Valley」「The Pickle Bang Theory」等の**施設名・店舗名**で
検索ヒットする。行き先・居住地・会場の3箇所すべてで精度向上。

### 方針
- `config.js` に `GOOGLE_MAPS_API_KEY` を追加済み（HTTPリファラ制限で保護）。
- 共通の `nominatimSearch()` を Google Places ベースの検索に置き換える:
  - **AutocompleteService.getPlacePredictions** で候補取得
  - 選択時に **PlacesService.getDetails / Geocoding** で座標・整形住所・国を取得
- 既存のカスタム暗色ドロップダウンUI（`AutoComplete` クラス）はそのまま維持し、
  データ取得層のみ差し替える。返却形は既存の `{name, full, country, lat, lng}` に合わせる。
- **フォールバック**: `GOOGLE_MAPS_API_KEY` が未設定/プレースホルダの時は従来の
  Nominatim を使う（デモ・ローカルで壊れない）。

### セキュリティ
- キーは公開リポジトリにコミットされるため、Google Cloud Console で
  HTTPリファラー制限（本番ドメイン + localhost）と API 制限（Places/Geocoding のみ）
  を必須とする。

---

## 影響ファイル
- `index.html` — ①③④のフロント実装、②のCSS調整
- `config.js` / `config.example.js` — Google キー（追加済み）
- `supabase-schema.sql` — `edit_token` 列・列権限・RPC関数を追記（別途実行用SQL）

## テスト/検証方針
- ローカル（`npm start`）でブラウザ表示確認。
- ②③④はUIを実際に操作して視認確認（モバイル幅・地図全体表示・施設名検索）。
- ①は登録→編集URL発行→別タブで編集/削除までの一連を確認。
- DB変更後は Supabase 上で RPC の権限挙動（他人のトークンで編集不可）を確認。

## スコープ外（今回やらない）
- サイト内管理者ログイン/管理画面（Dashboard運用を継続）
- マーカークラスタリング、Supabase Auth、イベント告知などの roadmap 項目
