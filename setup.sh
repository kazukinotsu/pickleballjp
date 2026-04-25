#!/usr/bin/env bash
# Picklejp Community Map — semi-automated setup (GitHub + Vercel)
# Requires: gh (GitHub CLI), vercel (Vercel CLI)  — script will check and guide.
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${CYAN}🎾 Picklejp Community Map — Setup${NC}"
echo ""

# ---------- Check Supabase config ----------
if [ ! -f "config.js" ] || grep -q "YOUR_SUPABASE" config.js; then
  echo -e "${YELLOW}⚠️  config.js のSupabase認証情報がまだ未設定です。${NC}"
  echo ""
  echo "先に以下を済ませてください:"
  echo "  1. https://supabase.com でプロジェクト作成"
  echo "  2. SQL Editor で supabase-schema.sql を実行"
  echo "  3. Settings > API からURLとanon keyをコピー"
  echo "  4. config.js の2行に貼り付け"
  echo ""
  echo "詳細は README.md を参照。"
  exit 1
fi
echo -e "${GREEN}✅ Supabase config OK${NC}"

# ---------- Check tools ----------
need_gh=1; need_vercel=1
command -v gh     >/dev/null 2>&1 || need_gh=0
command -v vercel >/dev/null 2>&1 || need_vercel=0

if [ "$need_gh" = "0" ]; then
  echo -e "${YELLOW}⚠️  GitHub CLI (gh) が見つかりません。${NC}"
  echo "    macOS: brew install gh"
  echo "    その他: https://cli.github.com"
fi
if [ "$need_vercel" = "0" ]; then
  echo -e "${YELLOW}⚠️  Vercel CLI が見つかりません。${NC}"
  echo "    npm i -g vercel"
fi

# ---------- Git init + first commit ----------
if [ ! -d ".git" ]; then
  echo ""
  echo -e "${CYAN}→ git init${NC}"
  git init -q
  git add -A
  git commit -q -m "Initial commit: Picklejp Community Map"
  git branch -M main 2>/dev/null || true
  echo -e "${GREEN}✅ Git initialized${NC}"
else
  echo -e "${GREEN}✅ Git repo exists${NC}"
fi

# ---------- GitHub repo ----------
if [ "$need_gh" = "1" ]; then
  if ! gh auth status >/dev/null 2>&1; then
    echo ""
    echo -e "${CYAN}→ GitHub にログインします${NC}"
    gh auth login
  fi
  REPO_NAME="picklejp-community-map"
  if gh repo view "$REPO_NAME" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ GitHub repo already exists: $REPO_NAME${NC}"
    git push -u origin main 2>/dev/null || true
  else
    echo ""
    echo -e "${CYAN}→ GitHub リポジトリを作成してpushします${NC}"
    read -p "  repository visibility (public/private) [public]: " vis
    vis=${vis:-public}
    gh repo create "$REPO_NAME" --source=. --push --"$vis"
    echo -e "${GREEN}✅ GitHub repo created and pushed${NC}"
  fi
fi

# ---------- Vercel deploy ----------
if [ "$need_vercel" = "1" ]; then
  echo ""
  read -p "Vercel にデプロイしますか? (y/n) [y]: " yn
  yn=${yn:-y}
  if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
    vercel --prod
    echo ""
    echo -e "${GREEN}🎉 デプロイ完了！${NC}"
  fi
fi

# ---------- If no CLI ----------
if [ "$need_gh" = "0" ] && [ "$need_vercel" = "0" ]; then
  echo ""
  echo -e "${CYAN}CLIが無いので、手動のGitHub + Vercel手順に進んでください:${NC}"
  echo "  1. https://github.com/new でリポジトリ作成"
  echo "  2. このフォルダをpush:"
  echo "       git remote add origin https://github.com/<user>/picklejp-community-map.git"
  echo "       git push -u origin main"
  echo "  3. https://vercel.com/new で Import → Deploy"
fi

echo ""
echo -e "${CYAN}完了後:${NC}"
echo "  - サイトURLを管理人に共有"
echo "  - Supabase Dashboard > Table Editor > members でデータ管理"
echo ""
