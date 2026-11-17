"""Add the editor route while retaining the existing review site's locations."""
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone

config = pathlib.Path("/etc/nginx/sites-available/ai-explorer.cloud")
if not config.exists():
    config = pathlib.Path("/etc/nginx/sites-enabled/ai-explorer.cloud").resolve()
original = config.read_text()
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
backup = pathlib.Path("/var/backups/markdown-editor-deploy")
backup.mkdir(mode=0o700, parents=True, exist_ok=True)
shutil.copy2(config, backup / ("nginx-" + stamp + ".conf"))
text = original
if "# markdown-editor-challenge" not in text:
    offset = text.index(";", text.index("server_name")) + 1
    text = text[:offset] + '''

    # markdown-editor-challenge
    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
    }
''' + text[offset:]
if "--tls" in sys.argv and "# markdown-editor-route" not in text:
    offset = text.index(";", text.index("server_name")) + 1
    text = text[:offset] + '''

    # markdown-editor-route
    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/ai-explorer.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai-explorer.cloud/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location = /markdown { return 301 https://ai-explorer.cloud/markdown/; }
    location ^~ /markdown/ {
        if ($scheme = http) { return 301 https://ai-explorer.cloud$request_uri; }
        client_max_body_size 25m;
        proxy_pass http://127.0.0.1:5174/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600;
    }
''' + text[offset:]
config.write_text(text)
try:
    subprocess.run(["nginx", "-t"], check=True)
    subprocess.run(["systemctl", "reload", "nginx"], check=True)
except Exception:
    config.write_text(original)
    raise
print("Nginx configured; original saved to", backup / ("nginx-" + stamp + ".conf"))
