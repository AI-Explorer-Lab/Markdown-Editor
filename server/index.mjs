import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createStore, StorageError } from "./storage.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5173);
const app = express();
const store = createStore(path.join(root, "paper"));
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
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!hosts.includes(req.headers.host))
    return res.status(403).json({ error: "仅允许本机访问" });
  const origin = req.headers.origin;
  if (origin && !hosts.some((h) => origin === `http://${h}`))
    return res.status(403).json({ error: "拒绝跨站请求" });
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use("/api", express.json({ limit: "25mb" }));
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
  await fs.writeFile(path.join(await store.assets(), name), b, { flag: "wx" });
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
    server: { middlewareMode: true, hmr: { host: "127.0.0.1" } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () =>
  console.log(`Markdown 编辑器 http://localhost:${port}`),
);
