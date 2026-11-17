import fs from "node:fs/promises";
import path from "node:path";
import { atomicJSON } from "./auth.mjs";
import { revision, StorageError } from "./storage.mjs";
export function createSettings(dir) {
  let queue = Promise.resolve();
  const file = path.join(dir, ".themes.json");
  async function current() {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  async function read() {
    await queue;
    const themes = await current();
    return { themes, revision: revision(JSON.stringify(themes)) };
  }
  function save({ themes, baseRevision }) {
    const job = queue.then(async () => {
      if (
        !Array.isArray(themes) ||
        themes.length > 100 ||
        Buffer.byteLength(JSON.stringify(themes)) > 1024 * 1024
      )
        throw new StorageError("主题库格式无效或过大");
      if (baseRevision !== revision(JSON.stringify(await current())))
        throw new StorageError("主题库已被其他窗口修改，请刷新后重试", 409);
      await atomicJSON(file, themes);
      return { themes, revision: revision(JSON.stringify(themes)) };
    });
    queue = job.catch(() => {});
    return job;
  }
  return { read, save };
}
