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
