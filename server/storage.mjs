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
  async function read(name) {
    const f = await safeFile(name);
    try {
      const content = await fs.readFile(f, "utf8");
      return { name: path.basename(f), content, revision: revision(content) };
    } catch (e) {
      if (e.code === "ENOENT") throw new StorageError("文章不存在", 404);
      throw e;
    }
  }
  async function save({ name, content, baseRevision }) {
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
      if (old !== null && baseRevision !== revision(old))
        throw new StorageError(
          "文件已存在或已被其他窗口修改。请重新打开，或另存为其他文件名。",
          409,
        );
      if (old === null && baseRevision)
        throw new StorageError("原文件已被移走，请另存为新文件。", 409);
      const temp = path.join(root, ".save-" + randomUUID());
      try {
        await fs.writeFile(temp, content, { flag: "wx" });
        await fs.rename(temp, f);
      } finally {
        await fs.rm(temp, { force: true });
      }
      return { name: path.basename(f), revision: revision(content) };
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
