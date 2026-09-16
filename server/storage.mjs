import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
export class StorageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const revision = (content) =>
  createHash("sha256").update(content).digest("hex");
export function normalizeName(name) {
  if (typeof name !== "string") throw new StorageError("请输入文件名");
  const n = name.trim().replace(/\.md$/i, "");
  if (
    !n ||
    n.length > 100 ||
    /[\\/<>:"|?*\x00-\x1f]/.test(n) ||
    n.startsWith(".") ||
    /[. ]$/.test(n)
  )
    throw new StorageError("文件名不能包含路径、特殊字符或以点开头");
  return n + ".md";
}
export function createStore(root) {
  let queue = Promise.resolve();
  async function init() {
    await fs.mkdir(root, { recursive: true });
    if ((await fs.lstat(root)).isSymbolicLink())
      throw new StorageError("paper 不能是符号链接");
  }
  async function safeFile(name) {
    await init();
    const f = path.join(root, normalizeName(name));
    try {
      if (!(await fs.lstat(f)).isFile())
        throw new StorageError("不能访问非普通文件");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return f;
  }
  async function styleFile(name) {
    await init();
    const dir = path.join(root, ".styles");
    await fs.mkdir(dir, { recursive: true });
    if (
      !(await fs.lstat(dir)).isDirectory() ||
      (await fs.lstat(dir)).isSymbolicLink()
    )
      throw new StorageError("样式目录不能是符号链接");
    const file = path.join(dir, normalizeName(name) + ".json");
    try {
      if (!(await fs.lstat(file)).isFile())
        throw new StorageError("样式文件不可用");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return file;
  }
  async function readAppearance(name) {
    try {
      return JSON.parse(await fs.readFile(await styleFile(name), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  const documentRevision = (content, appearance) =>
    appearance === null
      ? revision(content)
      : revision(JSON.stringify({ content, appearance }));
  async function read(name) {
    await queue;

    const f = await safeFile(name);
    try {
      const content = await fs.readFile(f, "utf8");
      const appearance = await readAppearance(name);
      return {
        name: path.basename(f),
        content,
        appearance,
        revision: documentRevision(content, appearance),
      };
    } catch (e) {
      if (e.code === "ENOENT") throw new StorageError("文章不存在", 404);
      throw e;
    }
  }
  async function save({ name, content, baseRevision, appearance }) {
    if (
      appearance !== undefined &&
      appearance !== null &&
      (typeof appearance !== "object" ||
        Array.isArray(appearance) ||
        Buffer.byteLength(JSON.stringify(appearance)) > 65536)
    )
      throw new StorageError("文章样式配置无效或过大");
    if (
      typeof content !== "string" ||
      Buffer.byteLength(content) > 2 * 1024 * 1024
    )
      throw new StorageError("文章不能超过 2 MB");
    const job = queue.then(async () => {
      const f = await safeFile(name);
      let old = null;
      try {
        old = await fs.readFile(f, "utf8");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const oldAppearance = await readAppearance(name);
      const nextAppearance =
        appearance === undefined ? oldAppearance : appearance;
      if (old !== null && baseRevision !== documentRevision(old, oldAppearance))
        throw new StorageError(
          "文件已存在或已被其他窗口修改。请重新打开，或另存为其他文件名。",
          409,
        );
      if (old === null && baseRevision)
        throw new StorageError("原文件已被移走，请另存为新文件。", 409);
      const temp = path.join(root, ".save-" + randomUUID());
      const style = await styleFile(name);
      const styleTemp = style + "." + randomUUID();
      let styleWritten = false;
      try {
        await fs.writeFile(temp, content, { flag: "wx" });
        await fs.writeFile(styleTemp, JSON.stringify(nextAppearance), {
          flag: "wx",
        });
        await fs.rename(styleTemp, style);
        styleWritten = true;
        await fs.rename(temp, f);
      } catch (error) {
        if (styleWritten) {
          await fs.writeFile(styleTemp, JSON.stringify(oldAppearance));
          await fs.rename(styleTemp, style);
        }
        throw error;
      } finally {
        await fs.rm(temp, { force: true });
        await fs.rm(styleTemp, { force: true });
      }
      return {
        name: path.basename(f),
        revision: documentRevision(content, nextAppearance),
      };
    });
    queue = job.catch(() => {});
    return job;
  }
  async function list() {
    await init();
    const entries = await fs.readdir(root, { withFileTypes: true });
    return Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map(async (e) => ({
          name: e.name,
          updated: (await fs.stat(path.join(root, e.name))).mtimeMs,
        })),
    ).then((a) => a.sort((a, b) => b.updated - a.updated));
  }
  async function assets() {
    await init();
    const dir = path.join(root, "assets");
    await fs.mkdir(dir, { recursive: true });
    if ((await fs.lstat(dir)).isSymbolicLink())
      throw new StorageError("assets 不能是符号链接");
    return dir;
  }
  return { read, save, list, assets };
}
