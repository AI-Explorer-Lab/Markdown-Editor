# 私人服务器部署与维护

当前入口为 `https://ai-explorer.cloud/markdown/`，应用独立监听 `127.0.0.1:5174`。复盘项目的 `/api/`、`/all-will-be-fine/` 继续由原配置提供服务。

## 数据与登录

- 代码：`/opt/markdown-editor/app`；独立 Node 24 LTS：`/opt/markdown-editor/node`。
- 数据：`/var/lib/markdown-editor/data`，正文为 `.md`，图片在 `assets/`，排版在 `.styles/`，主题库为 `.themes.json`。
- `.private/account.json` 只保存加盐 scrypt 密码摘要；`.private/sessions.json` 保存令牌摘要。实际令牌只在 HttpOnly、Secure、SameSite=Strict Cookie 中。服务端不设固定登录过期；Cookie 按浏览器允许的最长 400 天设置并在访问时续期，浏览器清理或过期后需重新登录。
- 无注册功能。登录后点“账号”可修改账号和密码，所有旧登录立即失效。点“退出”只撤销当前设备。
- 管理员撤销全部登录：`sudo -u markdown-editor env DATA_DIR=/var/lib/markdown-editor/data /opt/markdown-editor/node/bin/node /opt/markdown-editor/app/server/account.mjs revoke`。
- 忘记密码时使用 `account.mjs set`，从标准输入提供 `{"username":"...","password":"..."}`（至少 12 位）；不要把密码提交到 Git。
- `PUBLIC_URL` 必须与入口一致，`TRUST_PROXY=1` 仅用于可信的本机 Nginx。服务始终监听回环地址。Nginx 和应用均检查访问范围，所有数据接口及导出接口验证登录。

## 构建、首次安装与更新

在开发机执行 `npm ci`、`npm run build -- --base=/markdown/`。上传 `dist/`、`server/`、`public/`、`deploy/`、`package.json`、`package-lock.json`，不要上传本地 `paper/` 或 `.secrets/`。

首次安装由 `sudo bash deploy/bootstrap.sh` 创建系统用户、安装独立 Node、生产依赖、Playwright 浏览器和系统依赖、安装服务与备份定时器。首次生成的随机凭据只写入 `/home/ubuntu/.markdown-access.json`，下载妥善保存后移除此临时文件。

`configure-nginx.py` 会先把现有 Nginx 配置备份到 `/var/backups/markdown-editor-deploy/`，通过 `nginx -t` 后重载。先配置 ACME challenge 路径，以 Certbot webroot 签发 `ai-explorer.cloud` 证书，再带 `--tls` 配置编辑器入口。续期成功时重载 Nginx。

更新时先手动触发备份，将新代码放入应用目录、执行 `npm ci --omit=dev`，再 `sudo systemctl restart markdown-editor`。数据和备份都在应用目录之外，不覆盖它们。

## 备份、清理与恢复

- 定时器：`markdown-editor-backup.timer`，每天北京时间凌晨 03:00 执行；停机错过的任务会在下次开机补做。
- 备份位置：`/var/backups/markdown-editor`，仅服务用户和管理员可读取。
- 保留最近 7 份每日归档、4 份每周归档。每周归档取该周首次成功备份，文件名使用当周周一日期；同一天重复备份更新当日归档。
- 先生成压缩归档、检查归档可读性、计算 SHA-256 并校验每周副本，然后才删除超量的旧归档和对应校验文件。新备份失败时不清理旧备份。只清理符合固定命名规则的普通文件，文章和图片不参与清理。
- 文章、图片和主题写入与归档串行执行，避免备份截取半次写入。账号和登录记录也包含在完整备份中，备份应视为私密文件。
- 手动执行：`sudo systemctl start markdown-editor-backup.service`；检查：`sudo journalctl -u markdown-editor-backup.service`。
- 页面顶部“下载完整备份”可下载当前完整数据，建议另存到自己的电脑；服务器内备份不能替代异地备份。
- 恢复前停服务，将当前数据完整另存一份，检查归档 SHA-256 和 `tar -tzf`，解压到空目录核对，再替换数据目录并恢复 `markdown-editor` 所有权。启动前执行 `account.mjs revoke` 撤销归档里的旧登录。

## 验证

`npm run test:server` 包含认证、Cookie 属性、跨站拒绝、重启登录持久化、退出/改密撤销、跨设备读取、冲突控制、归档恢复和保留策略测试。符号链接测试需 Linux 或允许创建符号链接的 Windows 环境。

浏览器回归需隔离的本机服务与测试账号，默认 `test-writer` / `browser-test-only-password`，可通过 `TEST_USERNAME`、`TEST_PASSWORD` 覆盖。运行 `npx playwright install chromium` 后执行 `npx playwright test`。不要向生产服务运行会写入测试数据的完整回归。
