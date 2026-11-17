import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createStore, StorageError } from "./storage.mjs";
import { createAuth } from "./auth.mjs";
import { createSettings } from "./settings.mjs";
import { createBackup } from "./backup.mjs";
import http from "node:http";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5173);
const app = express();
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, "paper"));
const publicURL = process.env.PUBLIC_URL
  ? new URL(process.env.PUBLIC_URL)
  : null;
const auth = createAuth(path.join(dataDir, ".private"), {
  secure: publicURL?.protocol === "https:",
  cookiePath: publicURL?.pathname || "/",
});
const store = createStore(dataDir);
const settings = createSettings(dataDir);
const backup = createBackup(
  dataDir,
  path.resolve(process.env.BACKUP_DIR || path.join(root, "backups")),
);
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", "loopback");
await fs
  .copyFile(
    path.join(root, "public/sample-lake.png"),
    path.join(await store.assets(), "sample-lake.png"),
    (await import("node:fs")).constants.COPYFILE_EXCL,
  )
  .catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
app.disable("x-powered-by");
app.use((req, res, next) => {
  const hosts = [
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    ...(publicURL ? [publicURL.host] : []),
  ];
  if (!hosts.includes(req.headers.host))
    return res.status(403).json({ error: "访问域名未授权" });
  const origin = req.headers.origin;
  const origins = publicURL
    ? [publicURL.origin]
    : hosts.map((h) => `http://${h}`);
  const homepageNavigation =
    req.method === "GET" &&
    req.path === "/" &&
    req.headers["sec-fetch-mode"] === "navigate" &&
    req.headers["sec-fetch-dest"] === "document";
  if (
    (origin && !origins.includes(origin)) ||
    (req.headers["sec-fetch-site"] === "cross-site" && !homepageNavigation)
  )
    return res.status(403).json({ error: "拒绝跨站请求" });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", express.json({ limit: "25mb" }));
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.post("/api/auth/login", auth.login);
app.post("/api/auth/logout", auth.logout);
app.use("/api", async (req, res, next) => {
  const username = await auth.authenticate(req, res);
  if (!username) return res.status(401).json({ error: "请先登录" });
  req.username = username;
  next();
});
app.get("/api/auth/session", (req, res) =>
  res.json({ username: req.username }),
);
app.post("/api/auth/account", auth.changeAccount);
app.get("/api/themes", async (req, res) => res.json(await settings.read()));
app.put("/api/themes", async (req, res) =>
  res.json(await store.exclusive(() => settings.save(req.body))),
);
app.get("/api/backup", async (req, res) => {
  const file = await store.exclusive(() => backup.run());
  res.download(file, "markdown-backup.tar.gz");
});
app.get("/api/papers", async (req, res) => res.json(await store.list()));
app.get("/api/papers/:name", async (req, res) =>
  res.json(await store.read(req.params.name)),
);
app.put("/api/papers", async (req, res) =>
  res.json(await store.save(req.body)),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});
app.post("/api/images", upload.single("image"), async (req, res) => {
  const b = req.file?.buffer;
  if (!b) throw new StorageError("请选择图片");
  let ext = "";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    ext = "png";
  else if (b[0] === 255 && b[1] === 216 && b[2] === 255) ext = "jpg";
  else if (["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString()))
    ext = "gif";
  else if (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    ext = "webp";
  if (!ext)
    throw new StorageError("支持 PNG、JPEG、WebP、GIF 图片，单张不超过 12 MB");
  const name = randomUUID() + "." + ext;
  await store.exclusive(async () =>
    fs.writeFile(path.join(await store.assets(), name), b, { flag: "wx" }),
  );
  res.json({ path: "assets/" + name });
});
app.get("/api/assets/:name", async (req, res) => {
  if (!/^[\w-]+\.(png|jpg|gif|webp)$/.test(req.params.name))
    throw new StorageError("无效图片路径");
  const f = path.join(await store.assets(), req.params.name);
  if (!(await fs.lstat(f)).isFile()) throw new StorageError("图片不可用");
  res.sendFile(f);
});
let pdfActive = false;
app.post("/api/pdf", async (req, res) => {
  if (pdfActive) throw new StorageError("另一个 PDF 正在生成，请稍后重试", 429);
  if (typeof req.body.html !== "string") throw new StorageError("缺少文章内容");
  pdfActive = true;
  let browser;
  try {
    const options = { headless: true };
    const chrome =
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    try {
      await fs.access(chrome);
      options.executablePath = chrome;
    } catch {}
    browser = await chromium.launch(options);
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => route.abort()); // The submitted document must be self-contained. No network or local file access.
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.setContent(req.body.html, { waitUntil: "load", timeout: 20000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
      timeout: 30000,
    });
    res.type("pdf").send(pdf);
  } finally {
    await browser?.close();
    pdfActive = false;
  }
});
app.use("/api", (err, req, res, next) => {
  console.error(err.message);
  res
    .status(err.status || (err.code === "ENOENT" ? 404 : 400))
    .json({ error: err.message || "操作失败" });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: { host: "127.0.0.1", port: port + 20000 },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () =>
  console.log(`Markdown 编辑器 http://localhost:${port}`),
);
if (process.env.BACKUP_SOCKET) {
  const socket = process.env.BACKUP_SOCKET;
  const internal = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/backup") {
      res.writeHead(404).end();
      return;
    }
    try {
      const file = await store.exclusive(() => backup.run());
      console.log("备份及保留策略执行成功：" + path.basename(file));
      res.end(JSON.stringify({ file }));
    } catch (e) {
      console.error("备份失败：" + e.message);
      res
        .writeHead(500)
        .end(JSON.stringify({ error: "备份失败，请检查服务日志" }));
    }
  });
  await fs.rm(socket, { force: true });
  internal.listen(socket, () => fs.chmod(socket, 0o600));
}
