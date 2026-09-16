import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStore, normalizeName } from "../server/storage.mjs";
test("names cannot escape paper", () => {
  for (const n of ["../x", "/tmp/x", "a/b", "a\\b", ".hidden", "a\0b", ""])
    assert.throws(() => normalizeName(n));
  assert.equal(normalizeName("  文章.md  "), "文章.md");
});
test("create, overwrite, collision and concurrent revision control", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-store-"));
  try {
    const s = createStore(root);
    const first = await s.save({ name: "test", content: "one" });
    await assert.rejects(s.save({ name: "test", content: "collision" }), {
      status: 409,
    });
    const next = await s.save({
      name: "test",
      content: "two",
      baseRevision: first.revision,
    });
    assert.equal((await s.read("test")).content, "two");
    assert.equal((await s.list()).length, 1);
    const results = await Promise.allSettled([
      s.save({ name: "test", content: "three", baseRevision: next.revision }),
      s.save({ name: "test", content: "four", baseRevision: next.revision }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    await fs.writeFile(path.join(root, "test.md"), "external");
    await assert.rejects(
      s.save({ name: "test", content: "lost", baseRevision: next.revision }),
      { status: 409 },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("symbolic links cannot expose outside content", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-links-"));
  try {
    await fs.symlink("/etc/hosts", path.join(root, "link.md"));
    const s = createStore(root);
    await assert.rejects(s.read("link"));
    await assert.rejects(s.save({ name: "link", content: "bad" }));
    await fs.symlink("/tmp", path.join(root, "assets"));
    await assert.rejects(s.assets());
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("appearance snapshots participate in revision checks and remain separate from Markdown", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-styles-"));
  try {
    const s = createStore(root);
    const appearance = {
      theme: "plain",
      custom: {
        version: 1,
        base: "plain",
        name: "Blue",
        values: { accent: "#123abc" },
      },
      fontSize: 16,
      lineHeight: 1.8,
    };
    const first = await s.save({
      name: "article",
      content: "# Hello",
      appearance,
    });
    assert.deepEqual((await s.read("article")).appearance, appearance);
    assert.equal(
      await fs.readFile(path.join(root, "article.md"), "utf8"),
      "# Hello",
    );
    const changed = { ...appearance, fontSize: 18 };
    const second = await s.save({
      name: "article",
      content: "# Hello",
      appearance: changed,
      baseRevision: first.revision,
    });
    assert.notEqual(first.revision, second.revision);
    await assert.rejects(
      s.save({
        name: "article",
        content: "# Overwrite",
        appearance,
        baseRevision: first.revision,
      }),
      { status: 409 },
    );
    await s.save({
      name: "article",
      content: "# New text",
      baseRevision: second.revision,
    });
    assert.deepEqual((await s.read("article")).appearance, changed);
    await fs.symlink(
      "/etc/hosts",
      path.join(root, ".styles", "unsafe.md.json"),
    );
    await assert.rejects(s.save({ name: "unsafe", content: "x", appearance }));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
