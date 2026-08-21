# Picklejp Community Map

世界の日系ピックルボール・コミュニティ・データベース。
日本＋海外の日系/日本語コミュニティを、「訪問地から近い順」で検索できるウェブアプリ。

- **フロントエンド**: 単一HTML (`index.html`) — ビルド不要
- **バックエンド**: [Supabase](https://supabase.com) (Postgres + RLS)
- **ホスティング**: [Vercel](https://vercel.com) 静的サイト

---

## セットアップ (実測 10 分)

### 1. Supabase プロジェクトを作る (5 分)

1. https://supabase.com/dashboard にサインアップ / ログイン
2. **New project** をクリック
   - **Name**: `picklejp` など
   - **Database Password**: 適当に生成 (メモ不要、管理画面から操作)
   - **Region**: Tokyo (ap-northeast-1) 推奨
3. プロジェクト作成完了まで 1-2 分待つ
4. 左メニュー **SQL Editor** > **New query** を開く
5. 本リポジトリの [`supabase-schema.sql`](./supabase-schema.sql) の全内容をコピーして貼り付け → **Run**
   - "Success. No rows returned." と出ればOK。11人のサンプルメンバーも同時に登録されます
6. 左メニュー **Settings** > **API** を開く
   - `Project URL` (例: `https://xxxxx.supabase.co`) をコピー
   - `Project API Keys` の `anon` `public` の長いJWT文字列をコピー

### 2. config.js に認証情報を貼る (30 秒)

`config.js` を開き、2行を書き換える:

```js
window.SUPABASE_URL      = "https://xxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGci...（Supabaseからコピーした長いやつ）";
```

> **安全性について**: anon keyはブラウザに公開される前提で設計されています。コミットしてもOK。実際のデータ保護は `supabase-schema.sql` 内のRow Level Security (RLS) ポリシーで行っています。絶対にブラウザに入れてはいけないのは `service_role` キーの方で、こちらは使いません。

### 3. Vercel にデプロイ (3 分)

どれか1つの方法で:

#### A. GitHub 連携 (推奨・長期運用向け)

1. GitHub で新規リポジトリ作成 (例: `picklejp-community-map`)
2. このフォルダを push
   ```bash
   git init
   git add -A
   git commit -m "Initial: Picklejp Community Map"
   git branch -M main
   git remote add origin https://github.com/<yourname>/picklejp-community-map.git
   git push -u origin main
   ```
3. https://vercel.com/new を開いてリポジトリを **Import** → **Deploy** をクリック
4. 30秒で `https://picklejp-community-map-xxxx.vercel.app` が発行されます

#### B. Vercel CLI (手軽)

```bash
npm i -g vercel
vercel        # 初回はログインプロンプト → プロジェクト作成
vercel --prod # 本番デプロイ
```

#### C. 自動セットアップスクリプト (上の2つの組み合わせ)

`gh` (GitHub CLI) と `vercel` CLI が入っていれば:

```bash
chmod +x setup.sh
./setup.sh
```

GitHubリポジトリ作成 + push + Vercel連携まで半自動で進みます。

---

## ローカル確認

```bash
npm start   # http://localhost:3000 で立ち上がります
```

`config.js` がまだデフォルト値のままだと **「デモモード」バナー** が出て、データは端末ローカルのみに保存されます (本番では Supabase に保存)。

---

## 管理 (メンバーの承認・削除)

メンバーデータは Supabase Dashboard > **Table Editor** > `members` から直接編集できます。

- **削除**: 該当行を削除
- **非公開にする**: `is_published` を `false` にチェック外す (サイトには表示されなくなる)
- **モデレーション有効化**: `is_published` の DEFAULT を `false` に変更し、新規登録は必ず管理人承認後に公開、という運用もできます

```sql
-- モデレーション運用に切り替える場合:
alter table public.members alter column is_published set default false;
```

---

## スタック / ファイル構成

```
picklejp-app/
├── index.html              # アプリ本体 (日英切替・オートコンプリート・訪問地検索)
├── config.js               # Supabase 認証情報 (要編集)
├── config.example.js       # config.js のテンプレ
├── supabase-schema.sql     # DB スキーマ + RLS + シードデータ
├── package.json            # メタデータ + ローカルサーバー
├── vercel.json             # Vercel デプロイ設定
├── .gitignore
├── README.md               # このファイル
└── setup.sh                # 自動セットアップスクリプト
```

---

## よくある質問

**Q. 複数の管理人で共有したい**  
→ Supabase Dashboard の **Settings** > **Team** から、他の管理人のメールを追加して招待。

**Q. 独自ドメイン (例: `picklejp.com`) を使いたい**  
→ Vercel のプロジェクト > **Settings** > **Domains** で追加。DNS の CNAME 設定のみ。

**Q. データをエクスポートしたい**  
→ サイト右上 > メンバー一覧 > **CSVで書き出し**、または Supabase Dashboard > Table Editor > **Export to CSV**。

**Q. スパム対策は?**  
→ 初期段階は Supabase Dashboard で手動モデレーション。規模が大きくなってきたら、登録時 CAPTCHA (hCaptcha) 追加、メンバー承認フロー化などの対応を入れます。

---

## 編集機能（本人用）
登録完了時に「編集用URL」（`?edit=<id>&token=<token>`）が発行されます。本人はこのURLから自分のエントリーを編集・削除できます。DBは `db/2026-06-03-edit-feature.sql` を Supabase の SQL Editor で実行して有効化します。

## 場所検索（Google Places）
`config.js` の `GOOGLE_MAPS_API_KEY` を設定すると施設名検索（Places API）になります。未設定時は OpenStreetMap (Nominatim) にフォールバックします。キーは Google Cloud Console で HTTPリファラー制限 + API制限（Places/Geocoding）をかけてください。

---

## Squeezy Drop Radar（`/drops`）

Squeezy・NeeDoh・Smushmart・Smusher・RMS Dumplings の新作・限定ドロップを **Target / Walmart / Walgreens** の3店について「事前に把握」するツール。ピックルボール本体とは独立した追加ページで、同じ Vercel でそのまま配信されます。追跡ブランドは `drops.html` の `BRANDS` 配列に1行足せば全体（スキャン・リンク・バッジ）に反映されます。

- **ページ**: [`drops.html`](./drops.html) → 本番では `/drops`（`vercel.json` の cleanUrls）
- **カレンダーデータ**: [`drops-data.json`](./drops-data.json) — 今後のドロップ予定（スクワッド名・予定日・確度・TCIN）。`confidence: "sample"` の行は構造を示すダミーなので、リーク/コレクター情報で差し替えて運用します。
- **Target 自動監視（サーバー関数）**: [`api/target-check.js`](./api/target-check.js) — Target が内部利用する公開商品API **Redsky** をサーバー側から叩き、CORS を回避して以下を取得：
  - `?tcin=…` … 特定商品の発売日(street date)・購入可否・在庫シグナル
  - `?keyword=squeezy+toy` … いま Target に登録済みの SKU 一覧 → カレンダー未登録＝**未告知ドロップの早期検知**

### なぜ「事前に分かる」のか
小売の商品DBには、一般販売が始まる前に SKU（Target なら TCIN）と発売日が登録されます。Redsky はその情報を露出するため、棚に並ぶ前・購入可能になる前に検知できます。Walmart / Walgreens は bot 対策が強く安定監視が難しいため、現状はカレンダー管理（手動・コミュニティ更新）です。

### Target APIキー
Redsky の `key` は target.com フロントに埋め込まれた公開キーで、定期的にローテーションされます。失効したら Vercel の環境変数 **`TARGET_REDSKY_KEY`** に最新の公開キーを設定してください（未設定時はコード内フォールバックを使用）。

### DPCI 監視 + メール通知（Drop Watch）

店舗の Line listing で見える **DPCI**（Target の商品番号 例 `086-03-3602`）を登録しておくと、
**近くの Target 1店舗**について発売タイミングを自動監視し、条件を満たしたらメールが飛びます。

| ファイル | 役割 |
|---|---|
| [`watchlist.json`](./watchlist.json) | 監視する DPCI と ZIP。ここに行を足すだけで対象追加 |
| [`scripts/check-drops.mjs`](./scripts/check-drops.mjs) | DPCI→商品解決、発売日/在庫/購入可否の変化検出、メール本文生成 |
| [`scripts/watch-local.sh`](./scripts/watch-local.sh) | **Mac 常駐用ランナー**。検知したら GitHub Issue を作成 |
| [`scripts/install-mac.sh`](./scripts/install-mac.sh) | launchd への登録 / 解除 / 状態確認 |
| [`.github/workflows/drop-watch.yml`](./.github/workflows/drop-watch.yml) | 手動実行用（定期実行は後述の理由で停止中） |
| `state/drop-state.json` | 前回状態（自動生成・端末ローカル）。同じ事象を二重通知しないため |

**通知の条件**（いずれか）
- `street date`（発売日）が **今日 or 明日** になった
- 最寄り店舗の在庫が **無 → 有** に変わった
- オンラインで **購入不可 → 可** に変わった

### Redsky 呼び出しの作法（重要）

一時期 403 + CAPTCHA で全滅していましたが、原因は **`Origin` / `Referer` の偽装**でした。ブラウザでないクライアントが `Origin: https://www.target.com` を送ると Akamai に検知されます。実測:

| リクエスト | 結果 |
|---|---|
| `Origin` / `Referer` を付ける | ❌ 403 + `captchaRelativeURL` |
| **`Accept` のみ（偽装しない）** | ✅ 200 |

そのため `check-drops.mjs` は**偽装ヘッダを送りません**。GitHub Actions のランナーからも正常に取得できます（IP は関係ありませんでした）。

**必須の GraphQL 変数**: 欠けると 400 になります。
- `plp_search_v2` … `pricing_store_id`, `visitor_id`
- `pdp_client_v1` … `pricing_store_id`

**DPCI は直接検索できません**（無関係な商品が返る）。検索結果には `item.dpci` が含まれるので、`searchKeywords` のブランド名で広く検索し、DPCI で突き合わせています。監視対象のブランドが増えたら `watchlist.json` の `searchKeywords` に足してください。

取得可否を再確認したいときは Actions タブの **Probe Target reachability** を手動実行してください（必要変数を自動探索して結果を出します）。

### Mac 常駐（任意）

GitHub Actions の定期実行だけで完結するため、通常は不要です。手元でも動かしたい場合のみ:

```bash
brew install gh          # 未インストールなら
gh auth login            # 未ログインなら（ブラウザで認証・一度きり）
bash scripts/install-mac.sh
```

launchd の LaunchAgent として登録され、15分おきに起動して**朝 6:00–10:00 の間だけ** Target を確認します（ドロップは開店8時前後に反映されるため）。インストール時に動作テストが1回走ります。

| コマンド | 用途 |
|---|---|
| `bash scripts/install-mac.sh --status` | 常駐状態と直近ログ |
| `bash scripts/install-mac.sh --remove` | 常駐を解除 |
| `DROPWATCH_FORCE=1 scripts/watch-local.sh` | 時間帯を無視して手動実行 |
| `tail -f state/dropwatch.log` | ログを追う |

時間帯は `DROPWATCH_START` / `DROPWATCH_END`（時、0–23）で変更できます。

> **Mac がスリープしていると実行されません。** システム設定 → ロック画面 で、電源接続時にスリープしない設定にしておくと確実です。

**通知の受け取り**: 検知すると `drop-alert` ラベル付きの **GitHub Issue** が立ち、自分が assignee になるので GitHub の通知メールが届きます。**新しい資格情報は不要**です。届かない場合は GitHub の Settings → Notifications でメール通知が有効か確認してください。

**任意の環境変数 / Secrets**

| 名前 | 内容 |
|---|---|
| `TARGET_REDSKY_KEY` | Redsky 公開キーが失効したとき差し替え |
| `TARGET_STORE_ID` | 監視店舗を固定したいとき（未指定なら ZIP から最寄り店舗を解決） |
| `MAIL_*`（Actions のみ・任意） | SMTP を登録した場合、Actions 実行時に HTML メールも直接送る |

### ローカル確認の注意
`npm start`（静的配信）では `api/` のサーバー関数が動かないため、Target 自動監視は無効化され、ページ上部に案内バナーが出ます。監視まで含めて確認するには Vercel にデプロイするか `vercel dev` を使ってください。カレンダー表示・フィルタ・自分用ドロップ追加（端末内 localStorage 保存）は静的環境でも動作します。
