import { openThemes } from "./theme-panel";
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const setSource = async (page: any, source: string) => {
  const editor = page.getByRole("textbox", { name: "Markdown 源码" });
  await editor.fill(source);
  await expect(page.locator(".article")).toHaveAttribute("data-ready", "true");
};
test("editor renders all syntax and distinct themes without changing source", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".article .diagram svg")).toBeVisible();
  await expect(page.locator(".article .diagram svg")).toContainText("记录灵感");
  await openThemes(page);
  await expect(page.locator(".theme-grid button")).toHaveCount(10);
  const source =
    "# 标题\n\n[TOC]\n\n## 子标题\n\n## 子标题\n\n**粗体** *斜体* ~~删除~~ `inline`\n\n> 引用\n>\n> - 嵌套\n\n3. 三\n4. 四\n\n- [x] 已完成\n- [ ] 未完成\n\n|左|右|\n|:--|--:|\n|a|b|\n\n$$\nx^2 + y^2 = z^2\n$$\n\n公式 $E=mc^2$ 和价格 $5。\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n脚注[^1]\n\n[^1]: 注释\n\n---\n\n<script>alert(1)</script>";
  await setSource(page, source);
  await expect(page.locator(".article table")).toBeVisible();
  await expect(page.locator(".article .katex")).toHaveCount(2);
  await expect(page.locator(".article .toc a")).toHaveCount(3);
  expect(
    await page
      .locator(".article h2")
      .evaluateAll((els) => els.map((e) => e.id)),
  ).toEqual([
    "heading-%E5%AD%90%E6%A0%87%E9%A2%98",
    "heading-%E5%AD%90%E6%A0%87%E9%A2%98-1",
  ]);
  await expect(page.locator(".article input[type=checkbox]")).toHaveCount(2);
  await expect(page.locator(".article script")).toHaveCount(0);
  const fonts = new Set<string>();
  for (const name of [
    "素白",
    "墨书",
    "海盐",
    "松林",
    "赤陶",
    "紫藤",
    "琥珀",
    "极客",
    "报刊",
    "夜航",
  ]) {
    await openThemes(page);
    await page
      .getByRole("button", { name: name + "主题", exact: true })
      .click();
    await page
      .getByRole("button", { name: "应用这个风格", exact: true })
      .click();
    fonts.add(
      await page
        .locator(".article h2")
        .first()
        .evaluate((e) => {
          const s = getComputedStyle(e);
          return [
            s.backgroundColor,
            s.border,
            s.fontFamily,
            s.textAlign,
            s.boxShadow,
          ].join("|");
        }),
    );
  }
  expect(fonts.size).toBeGreaterThanOrEqual(8);
  expect(errors).toEqual([]);
});
test("first save binds a file and keyboard save overwrites it; upload survives reopen", async ({
  page,
}) => {
  const name = "e2e-" + Date.now();
  let asset = "";
  try {
    await page.goto("/");
    await setSource(page, "# 保存验证\n\nfirst");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("textbox", { name: "文件名" }).fill(name);
    await page.getByRole("button", { name: "保存文章", exact: true }).click();
    await expect(page.locator(".save-status")).toHaveText("已保存");
    expect(
      await fs.readFile(path.join("paper", name + ".md"), "utf8"),
    ).toContain("first");
    await setSource(page, "# 保存验证\n\nsecond");
    await page.keyboard.press("Meta+s");
    await expect(page.locator(".save-status")).toHaveText("已保存");
    expect(
      await fs.readFile(path.join("paper", name + ".md"), "utf8"),
    ).toContain("second");
    await page.getByLabel("选择本地图片").setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.locator(".article img")).toBeVisible();
    asset = (await page.locator(".article img").getAttribute("src"))!.replace(
      "/api/",
      "",
    );
    await page.keyboard.press("Meta+s");
    await expect(page.locator(".save-status")).toHaveText("已保存");
    await page.reload();
    await expect(page.locator(".article img")).toBeVisible();
    expect(
      (await fs.readdir("paper")).filter((n) => n === name + ".md"),
    ).toHaveLength(1);
  } finally {
    await fs.rm(path.join("paper", name + ".md"), { force: true });
    await fs.rm(path.join("paper", ".styles", name + ".md.json"), {
      force: true,
    });
    if (asset) await fs.rm(path.join("paper", asset), { force: true });
  }
});
test("HTML embeds images and formulas; PDF is a real downloadable document", async ({
  page,
}) => {
  await page.goto("/");
  await setSource(
    page,
    "# 导出验证\n\n公式 $x^2$\n\n```mermaid\nflowchart LR\n A --> B\n```",
  );
  await expect(page.locator(".article .diagram svg")).toBeVisible();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML 文件" }).click();
  const html = await fs.readFile(
    (await dl).suggestedFilename() ? ((await (await dl).path()) as string) : "",
    "utf8",
  );
  expect(html).toContain("data:image/png");
  expect(html).not.toContain("<script");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const pdfDl = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 文件" }).click();
  const pdf = await pdfDl;
  const content = await fs.readFile((await pdf.path())!);
  expect(content.subarray(0, 5).toString()).toBe("%PDF-");
  expect(content.length).toBeGreaterThan(3000);
});
test("clipboard has separate rich HTML adapters and layout stays within viewport", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await setSource(page, "# 复制验证\n\n## 二级\n\n> 引用\n\n**重点**");
  await openThemes(page);
  await page.getByRole("button", { name: "海盐主题", exact: true }).click();
  await page.getByRole("button", { name: "应用这个风格", exact: true }).click();
  await page.getByRole("button", { name: "复制到公众号", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText("已复制");
  const read = () =>
    page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return (await items[0].getType("text/html")).text();
    });
  const wechat = await read();
  await page.getByRole("button", { name: "复制到知乎", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText("已复制知乎");
  const zhihu = await read();
  expect(wechat).not.toEqual(zhihu);
  expect(wechat).toContain("复制验证");
  const sizes = await page
    .locator(".editing-pane,.preview-pane")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(sizes.every((n) => n > 200)).toBeTruthy();
  await page.screenshot({
    path: "plan/design/clipboard-layout.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "预览", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".article h1")).toBeVisible();
});
test("pasted and dropped images insert local resources; bad image and link remain safe", async ({
  page,
}) => {
  const assets: string[] = [];
  try {
    await page.goto("/");
    await setSource(page, "# 图片输入\n\n");
    for (const kind of ["paste", "drop"]) {
      await page
        .getByRole("textbox", { name: "Markdown 源码" })
        .evaluate((el, kind) => {
          const bytes = Uint8Array.from(
            atob(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            ),
            (c) => c.charCodeAt(0),
          );
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
          el.dispatchEvent(
            kind === "paste"
              ? new ClipboardEvent("paste", {
                  clipboardData: dt,
                  bubbles: true,
                  cancelable: true,
                })
              : new DragEvent("drop", {
                  dataTransfer: dt,
                  bubbles: true,
                  cancelable: true,
                }),
          );
        }, kind);
      await expect(page.locator(".article img")).toHaveCount(assets.length + 1);
      assets.splice(
        0,
        assets.length,
        ...(await page
          .locator(".article img")
          .evaluateAll((els) =>
            els.map((e) => e.getAttribute("src")!.replace("/api/", "")),
          )),
      );
      await expect(page.locator(".busy-pill")).toHaveCount(0);
    }
    await setSource(
      page,
      "# 安全输入\n\n[危险](javascript:alert(1))\n\n![找不到](/not-found.png)",
    );
    await expect(page.locator(".broken-image")).toContainText("图片未能加载");
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByRole("button", { name: "PDF 文件" }).click();
    await expect(page.locator(".toast")).toContainText(
      "请修复图片后再导出 PDF",
    );
    await expect(page.locator('.article a[href^="javascript:"]')).toHaveCount(
      0,
    );
  } finally {
    for (const asset of assets)
      await fs.rm(path.join("paper", asset), { force: true });
  }
});
test("one hundred headings and invalid formulas or diagrams stay isolated", async ({
  page,
}) => {
  await page.goto("/");
  await setSource(
    page,
    "# 文档\n\n$$\\unknownmacro{x}$$\n\n```mermaid\nthis is invalid\n```\n\n## 后续正文\n\n仍可编辑",
  );
  await expect(page.locator(".render-error")).toHaveCount(2);
  await expect(page.locator(".article h2")).toHaveText("后续正文");
  const source = Array.from(
    { length: 100 },
    (_, i) =>
      `## 小节 ${i}\n\n` + "这是用于验证长文章输入和实时预览的内容。".repeat(6),
  ).join("\n\n");
  const start = Date.now();
  await setSource(page, source);
  await expect(page.locator(".article h2")).toHaveCount(100);
  console.log(
    "long article end-to-end fill + render ms:",
    Date.now() - start,
    "chars:",
    source.length,
  );
});
