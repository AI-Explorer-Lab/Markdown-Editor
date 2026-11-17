import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createBackup } from "../server/backup.mjs";
const execute = promisify(execFile);
test("verified backups retain seven daily and four weekly archives and restore all data", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-backup-"));
  try {
    const data = path.join(dir, "data"),
      backups = path.join(dir, "backups");
    await fs.mkdir(path.join(data, "assets"), { recursive: true });
    await fs.mkdir(path.join(data, ".styles"));
    await fs.writeFile(path.join(data, "文章.md"), "important");
    await fs.writeFile(path.join(data, "assets/image.png"), "image");
    await fs.writeFile(
      path.join(data, ".styles/文章.md.json"),
      '{"theme":"forest"}',
    );
    await fs.writeFile(path.join(data, ".themes.json"), "[]");
    const backup = createBackup(data, backups);
    for (let i = 0; i < 5; i++)
      await backup.run(new Date(Date.UTC(2026, 7, 3 + i * 7)));
    for (let i = 0; i < 10; i++)
      await backup.run(new Date(Date.UTC(2026, 8, 7 + i)));
    const names = await fs.readdir(backups);
    assert.equal(names.filter((n) => /^daily-.*\.tar.gz$/.test(n)).length, 7);
    assert.equal(names.filter((n) => /^weekly-.*\.tar.gz$/.test(n)).length, 4);
    assert.equal(names.filter((n) => n.endsWith(".sha256")).length, 11);
    const restore = path.join(dir, "restore");
    await fs.mkdir(restore);
    await execute("tar", [
      "-xzf",
      path.join(backups, "daily-2026-09-16.tar.gz"),
      "-C",
      restore,
    ]);
    for (const file of [
      "文章.md",
      "assets/image.png",
      ".styles/文章.md.json",
      ".themes.json",
    ])
      assert.deepEqual(
        await fs.readFile(path.join(restore, file)),
        await fs.readFile(path.join(data, file)),
      );
    await fs.writeFile(path.join(backups, "keep-me.txt"), "unrelated");
    const before = (await fs.readdir(backups)).sort();
    await assert.rejects(
      createBackup(data, backups, { tar: "missing-backup-program" }).run(
        new Date("2026-09-17T00:00:00Z"),
      ),
    );
    assert.deepEqual(
      (await fs.readdir(backups)).sort(),
      before,
      "failed backup must never prune",
    );
    assert.throws(() => createBackup(data, path.join(data, "nested-backups")));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
