#!/bin/bash
# -----------------------------------------------------------------------------
# Drop Watch — Mac 常駐用ランナー
#
# Target は データセンターIP からの API アクセスを CAPTCHA で拒否するため、
# 監視は「自宅回線にある Mac」から実行する。検知したら GitHub Issue を立て、
# GitHub の通知メールがそのまま通知になる（SMTP の資格情報は不要）。
#
# launchd から 15 分おきに呼ばれるが、実際に問い合わせるのは朝の時間帯だけ。
# ドロップは開店(8時前後)に反映されるため、既定は 6:00–10:00。
#
# 手動テスト:  DROPWATCH_FORCE=1 scripts/watch-local.sh
# -----------------------------------------------------------------------------
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
REPO="$(pwd)"

WINDOW_START="${DROPWATCH_START:-6}"
WINDOW_END="${DROPWATCH_END:-10}"
FORCE="${DROPWATCH_FORCE:-0}"

stamp() { date "+%Y-%m-%d %H:%M:%S"; }

# 時間帯の外なら何もしない（launchd は鳴り続けるが、実処理はこの窓だけ）
if [ "$FORCE" != "1" ]; then
  HOUR="$(date +%-H)"
  if [ "$HOUR" -lt "$WINDOW_START" ] || [ "$HOUR" -ge "$WINDOW_END" ]; then
    exit 0
  fi
fi

command -v node >/dev/null 2>&1 || { echo "$(stamp) ✗ node が見つかりません (PATH=$PATH)"; exit 1; }

rm -rf out
node scripts/check-drops.mjs
CHECK_RC=$?

if [ ! -f out/issue.md ]; then
  # 検知なし、または Target に到達できず。check 側がログに理由を出している。
  [ "$CHECK_RC" -ne 0 ] && echo "$(stamp) ✗ check-drops が異常終了 (rc=$CHECK_RC)"
  exit 0
fi

SUBJECT="$(cat out/subject.txt)"

if ! command -v gh >/dev/null 2>&1; then
  echo "$(stamp) ⚠ 検知したが gh CLI が無いため Issue を作成できません: $SUBJECT"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "$(stamp) ⚠ 検知したが gh が未ログインです（gh auth login）: $SUBJECT"
  exit 1
fi

gh label create drop-alert --color FF69B4 \
  --description "Target drop detected" --force >/dev/null 2>&1 || true

if URL=$(gh issue create \
      --title "$SUBJECT" \
      --body-file out/issue.md \
      --label drop-alert \
      --assignee @me 2>&1); then
  echo "$(stamp) ✅ 通知しました: $SUBJECT"
  echo "$(stamp)    $URL"
  rm -rf out
else
  echo "$(stamp) ✗ Issue 作成に失敗: $URL"
  exit 1
fi
