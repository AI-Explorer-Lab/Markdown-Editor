import fs from "node:fs/promises";
import { replaceFile } from "./file-io.mjs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
const execute = promisify(execFile);
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const day = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function createBackup(dataDir, backupDir, { tar = "tar" } = {}) {
  dataDir = path.resolve(dataDir);
  backupDir = path.resolve(backupDir);
  const relative = path.relative(dataDir, backupDir);
  if (
    !relative ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error("备份目录必须位于数据目录之外");
  let running;
  async function run(now = new Date()) {
    if (running) return running;
    running = perform(now).finally(() => {
      running = null;
    });
    return running;
  }
  async function perform(now) {
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(backupDir)).isSymbolicLink())
      throw new Error("备份目录不能是符号链接");
    const date = day(now);
    const monday = new Date(date + "T00:00:00Z");
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const week = monday.toISOString().slice(0, 10);
    const daily = path.join(backupDir, `daily-${date}.tar.gz`);
    const weekly = path.join(backupDir, `weekly-${week}.tar.gz`);
    const temp = path.join(backupDir, `.pending-${randomUUID()}.tar.gz`);
    try {
      await execute(
        tar,
        [
          "--exclude=.save-*",
          "--exclude=*.tmp",
          "-czf",
          temp,
          "-C",
          dataDir,
          ".",
        ],
        { timeout: 300000, maxBuffer: 1024 * 1024 },
      );
      await execute(tar, ["-tzf", temp], {
        timeout: 300000,
        maxBuffer: 16 * 1024 * 1024,
      });
      const hash = await sha256(temp);
      await replaceFile(temp, daily);
      await fs.writeFile(daily + ".sha256", hash + "\n", { mode: 0o600 });
      try {
        await fs.copyFile(
          daily,
          weekly,
          (await import("node:fs")).constants.COPYFILE_EXCL,
        );
        if ((await sha256(weekly)) !== hash)
          throw new Error("每周备份校验失败");
        await fs.writeFile(weekly + ".sha256", hash + "\n", { mode: 0o600 });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        const expected = (await fs.readFile(weekly + ".sha256", "utf8")).trim();
        if ((await sha256(weekly)) !== expected)
          throw new Error("已有每周备份校验失败，保留所有备份");
      }
      // Only canonical, regular archive files are eligible. Pruning starts after verification.
      const entries = await fs.readdir(backupDir, { withFileTypes: true });
      for (const [kind, count] of [
        ["daily", 7],
        ["weekly", 4],
      ]) {
        const candidates = entries
          .filter(
            (e) =>
              e.isFile() &&
              new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}\\.tar\\.gz$`).test(
                e.name,
              ),
          )
          .map((e) => e.name)
          .sort()
          .reverse();
        for (const name of candidates.slice(count)) {
          await fs.unlink(path.join(backupDir, name));
          await fs.rm(path.join(backupDir, name + ".sha256"), { force: true });
        }
      }
      return daily;
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  return { run };
}
