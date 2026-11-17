#!/usr/bin/env bash
set -euo pipefail
# Run as root after copying the reviewed release to /opt/markdown-editor/app.
APP=/opt/markdown-editor/app
if ! id markdown-editor >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/markdown-editor --create-home --shell /usr/sbin/nologin markdown-editor
fi
install -d -o markdown-editor -g markdown-editor -m 700 /var/lib/markdown-editor/data /var/lib/markdown-editor/browsers /var/backups/markdown-editor
if [[ ! -x /opt/markdown-editor/node/bin/node ]]; then
  work=$(mktemp -d)
  curl -fsSL https://nodejs.org/dist/index.json -o "$work/index.json"
  version=$(python3 -c 'import json,sys; print(next(v["version"] for v in json.load(open(sys.argv[1])) if v["version"].startswith("v24.") and v["lts"]))' "$work/index.json")
  curl -fsSL "https://nodejs.org/dist/$version/node-$version-linux-x64.tar.xz" -o "$work/node.tar.xz"
  curl -fsSL "https://nodejs.org/dist/$version/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
  expected=$(awk -v file="node-$version-linux-x64.tar.xz" '$2 == file {print $1}' "$work/SHASUMS256.txt")
  test -n "$expected"
  echo "$expected  $work/node.tar.xz" | sha256sum -c -
  install -d /opt/markdown-editor/node
  tar -xJf "$work/node.tar.xz" -C /opt/markdown-editor/node --strip-components=1
fi
export PATH=/opt/markdown-editor/node/bin:$PATH
cd "$APP"
npm ci --omit=dev
npx playwright install-deps chromium
sudo -u markdown-editor env PLAYWRIGHT_BROWSERS_PATH=/var/lib/markdown-editor/browsers /opt/markdown-editor/node/bin/node node_modules/playwright/cli.js install chromium --only-shell
if [[ ! -f /etc/markdown-editor.env ]]; then
  install -m 600 /dev/null /etc/markdown-editor.env
  cat > /etc/markdown-editor.env <<'ENV'
PORT=5174
DATA_DIR=/var/lib/markdown-editor/data
BACKUP_DIR=/var/backups/markdown-editor
PUBLIC_URL=https://ai-explorer.cloud/markdown/
TRUST_PROXY=1
BACKUP_SOCKET=/run/markdown-editor/backup.sock
PLAYWRIGHT_BROWSERS_PATH=/var/lib/markdown-editor/browsers
ENV
fi
if [[ ! -f /var/lib/markdown-editor/data/.private/account.json ]]; then
  sudo -u markdown-editor env DATA_DIR=/var/lib/markdown-editor/data /opt/markdown-editor/node/bin/node server/account.mjs generate > /home/ubuntu/.markdown-access.json
  chmod 600 /home/ubuntu/.markdown-access.json
  chown ubuntu:ubuntu /home/ubuntu/.markdown-access.json
fi
install -m 644 deploy/markdown-editor.service deploy/markdown-editor-backup.service deploy/markdown-editor-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now markdown-editor.service
systemctl enable --now markdown-editor-backup.timer
systemctl is-active markdown-editor.service
