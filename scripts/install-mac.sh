#!/bin/bash
# -----------------------------------------------------------------------------
# Drop Watch を Mac に常駐させる（launchd の LaunchAgent として登録）
#
#   bash scripts/install-mac.sh          # インストール / 再インストール
#   bash scripts/install-mac.sh --status # 状態を見る
#   bash scripts/install-mac.sh --remove # 常駐を解除
#
# 15分おきに起動し、朝 6:00–10:00 の間だけ Target を確認する。
# -----------------------------------------------------------------------------
set -uo pipefail

LABEL="com.picklejp.dropwatch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$REPO/state/dropwatch.log"

domain="gui/$(id -u)"

case "${1:-install}" in
  --remove|remove)
    launchctl bootout "$domain/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
    rm -f "$PLIST"
    echo "✅ 常駐を解除しました。"
    exit 0
    ;;
  --status|status)
    if launchctl print "$domain/$LABEL" >/dev/null 2>&1; then
      echo "✅ 常駐中: $LABEL"
      launchctl print "$domain/$LABEL" | grep -E "state|last exit|runs" | sed 's/^/   /'
    else
      echo "❌ 常駐していません。bash scripts/install-mac.sh で登録してください。"
    fi
    echo
    echo "直近のログ ($LOG):"
    tail -n 20 "$LOG" 2>/dev/null | sed 's/^/   /' || echo "   (まだありません)"
    exit 0
    ;;
esac

echo "▶ 前提を確認します"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "✗ node が見つかりません。https://nodejs.org からインストールするか、brew install node"
  exit 1
fi
echo "  ✅ node: $NODE_BIN ($("$NODE_BIN" -v))"

GH_BIN="$(command -v gh || true)"
if [ -z "$GH_BIN" ]; then
  echo "✗ GitHub CLI が見つかりません。brew install gh を実行してください。"
  exit 1
fi
echo "  ✅ gh: $GH_BIN"

if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh が未ログインです。先に gh auth login を実行してください（ブラウザで認証）。"
  exit 1
fi
echo "  ✅ gh 認証済み"

# launchd は PATH が最小限なので、node と gh のあるディレクトリを明示的に渡す
BIN_PATH="$(dirname "$NODE_BIN"):$(dirname "$GH_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$HOME/Library/LaunchAgents" "$REPO/state"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/scripts/watch-local.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$BIN_PATH</string>
  </dict>
</dict>
</plist>
PLISTEOF

launchctl bootout "$domain/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
if launchctl bootstrap "$domain" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST" 2>/dev/null; then
  echo "  ✅ launchd に登録しました: $PLIST"
else
  echo "✗ launchd への登録に失敗しました。"
  exit 1
fi

echo
echo "▶ 動作テスト（時間帯を無視して1回実行します）"
DROPWATCH_FORCE=1 bash "$REPO/scripts/watch-local.sh"
echo
echo "完了。15分おきに起動し、朝 6:00–10:00 の間だけ Target を確認します。"
echo "  状態確認: bash scripts/install-mac.sh --status"
echo "  解除:     bash scripts/install-mac.sh --remove"
echo "  ログ:     tail -f $LOG"
echo
echo "※ Mac がスリープしていると実行されません。システム設定 > ロック画面 で"
echo "   電源接続時にスリープしない設定にしておくと確実です。"
