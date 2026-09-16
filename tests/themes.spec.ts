import { openThemes } from "./theme-panel";
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
const source =
  "# 我的文章\n\n## 二级标题\n\n正文与 **重点**。\n\n> 引用内容\n\n- 条目\n\n| 名称 | 内容 |\n| --- | --- |\n| A | B |";
test("custom colors follow overrides, cancel restores, sample preserves source and copy matches export preview", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await openThemes(page);
  await page.getByRole("textbox", { name: "Markdown 源码" }).fill(source);
  await page.getByRole("button", { name: "素白主题", exact: true }).click();
  await page.getByRole("button", { name: "应用这个风格", exact: true }).click();
  await openThemes(page);
  await page.getByRole("button", { name: "基于此主题定制" }).click();
  await openThemes(page);
  await page
    .getByRole("textbox", { name: "主题主色", exact: true })
    .fill("#1255aa");
  await expect(page.locator(".preview-pane .article h2")).toHaveCSS(
    "color",
    "rgb(18, 85, 170)",
  );
  await page
    .locator(".theme-group > summary")
    .filter({ hasText: /^标题$/ })
    .click();
  await openThemes(page);
  await page
    .getByRole("textbox", { name: "2 级标题颜色", exact: true })
    .fill("#aa2244");
  await page
    .getByRole("textbox", { name: "主题主色", exact: true })
    .fill("#228855");
  await expect(page.locator(".preview-pane .article h2")).toHaveCSS(
    "color",
    "rgb(170, 34, 68)",
  );
  await expect(page.locator(".preview-pane .article strong")).toHaveCSS(
    "color",
    "rgb(34, 136, 85)",
  );
  await page
    .getByRole("button", { name: "重置2 级标题颜色", exact: true })
    .click();
  await expect(page.locator(".preview-pane .article h2")).toHaveCSS(
    "color",
    "rgb(34, 136, 85)",
  );
  await page.getByRole("button", { name: "查看样式示例", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "关闭效果预览" }).click();
  await page.getByRole("button", { name: "关闭主题面板" }).click();
  await expect(page.getByRole("textbox", { name: "Markdown 源码" })).toHaveText(
    source,
    { useInnerText: true },
  );
  await openThemes(page);
  await page
    .getByRole("button", { name: "公众号复制效果", exact: true })
    .click();
  const iframe = page.frameLocator('iframe[title="公众号导出结果"]');
  await expect(iframe.locator("h2")).toHaveCSS("color", "rgb(34, 136, 85)");
  await page.getByRole("button", { name: "关闭效果预览" }).click();
  await page.getByRole("button", { name: "复制到公众号", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("已复制");
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return (await items[0].getType("text/html")).text();
  });
  expect(html).toContain("rgb(34, 136, 85)");
  await openThemes(page);
  await page.getByRole("button", { name: "取消定制", exact: true }).click();
  await expect(page.locator(".preview-pane .article h2")).toHaveCSS(
    "color",
    "rgb(48, 59, 68)",
  );
});

test("theme library imports validate, snapshots survive a fresh browser and library deletion", async ({
  page,
  browser,
}) => {
  const name = "theme-e2e-" + Date.now();
  try {
    await page.goto("/");
    await openThemes(page);
    await page.getByRole("textbox", { name: "Markdown 源码" }).fill(source);
    await page.getByRole("button", { name: "基于此主题定制" }).click();
    await openThemes(page);
    await page.getByRole("textbox", { name: "主题名称" }).fill("我的蓝色");
    await page
      .getByRole("textbox", { name: "主题主色", exact: true })
      .fill("#123abc");
    await page.getByRole("button", { name: "保存为新主题" }).click();
    await expect(page.locator(".saved-theme")).toHaveCount(1);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("textbox", { name: "文件名" }).fill(name);
    await page.getByRole("button", { name: "保存文章", exact: true }).click();
    await expect(page.locator(".save-status")).toHaveText("已保存");
    const saved = JSON.parse(
      await fs.readFile(`paper/.styles/${name}.md.json`, "utf8"),
    );
    expect(saved.custom.values.accent).toBe("#123abc");
    await openThemes(page);
    await page.getByRole("tab", { name: /我的主题/ }).click();
    const dl = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出 我的蓝色", exact: true })
      .click();
    const downloaded = await dl;
    const data = await fs.readFile((await downloaded.path())!);
    await page.getByLabel("导入主题 JSON").setInputFiles({
      name: "theme.json",
      mimeType: "application/json",
      buffer: data,
    });
    await expect(page.locator(".saved-theme")).toHaveCount(2);
    await page
      .getByRole("button", { name: "编辑 我的蓝色", exact: true })
      .first()
      .click();
    await openThemes(page);
    await page
      .getByRole("textbox", { name: "主题主色", exact: true })
      .fill("#aa2200");
    await page
      .getByRole("button", { name: "更新所选主题", exact: true })
      .click();
    await expect(page.locator(".save-status")).toHaveText("未保存");
    // Editing a library theme affects the current unsaved appearance, not the saved article snapshot.
    expect(
      JSON.parse(await fs.readFile(`paper/.styles/${name}.md.json`, "utf8"))
        .custom.values.accent,
    ).toBe("#123abc");
    await page
      .getByRole("button", { name: "删除 我的蓝色", exact: true })
      .first()
      .click();
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:5173");
    other.on("dialog", (d) => d.accept());
    await other.getByRole("button", { name: "文章历史", exact: true }).click();
    await other.getByRole("button", { name: new RegExp(name) }).click();
    await expect(
      other.getByRole("heading", { name: "二级标题", exact: true }),
    ).toBeVisible();
    await expect(other.locator(".article h2")).toHaveCSS(
      "color",
      "rgb(18, 58, 188)",
    );
    await fresh.close();
    const invalid = {
      config: {
        version: 1,
        base: "plain",
        name: "不安全",
        values: { accent: "red;position:fixed" },
      },
      fontSize: 16,
      lineHeight: 1.8,
    };
    await page.getByLabel("导入主题 JSON").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
    await expect(page.locator(".toast")).toContainText("导入失败");
    await expect(page.locator(".saved-theme")).toHaveCount(1);
  } finally {
    await fs.rm(`paper/${name}.md`, { force: true });
    await fs.rm(`paper/.styles/${name}.md.json`, { force: true });
  }
});

test("custom dark paper uses export conversion without false image warnings", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await openThemes(page);
  await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .fill("# 深色定制\n\n正文");
  await page.getByRole("button", { name: "素白主题", exact: true }).click();
  await page.getByRole("button", { name: "应用这个风格", exact: true }).click();
  await openThemes(page);
  await page.getByRole("button", { name: "基于此主题定制" }).click();
  await page
    .getByRole("textbox", { name: "文章背景", exact: true })
    .fill("#182838");
  await page
    .getByRole("textbox", { name: "正文颜色", exact: true })
    .fill("#e0e6ec");
  await expect(page.locator(".preview-pane .article")).toHaveCSS(
    "background-color",
    "rgb(24, 40, 56)",
  );
  await page.getByRole("button", { name: "复制到公众号", exact: true }).click();
  await expect(page.locator(".toast")).toContainText(
    "深色文章背景已转换为浅色",
  );
  await expect(page.locator(".toast")).not.toContainText("外链图片");
  await openThemes(page);
  await page
    .getByRole("button", { name: "公众号复制效果", exact: true })
    .click();
  await expect(
    page.frameLocator('iframe[title="公众号导出结果"]').locator("article"),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("independent custom theme survives reload and has no builtin description", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .fill("# 标题\n\n## 子标题\n\n> 引用");
  await openThemes(page);
  await page.getByRole("button", { name: "夜航主题", exact: true }).click();
  await page.getByRole("button", { name: "应用这个风格", exact: true }).click();
  await page.getByRole("tab", { name: /我的主题/ }).click();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(page.locator(".designer-heading")).toContainText("独立自定义");
  await expect(page.locator(".preview-pane .article")).toHaveAttribute(
    "data-theme",
    "blank",
  );
  await expect(page.locator(".preview-pane .article")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".preview-pane .article h2")).toHaveCSS(
    "border-bottom-style",
    "none",
  );
  await page
    .getByRole("textbox", { name: "主题名称", exact: true })
    .fill("独立蓝色");
  await page
    .getByRole("textbox", { name: "主题主色", exact: true })
    .fill("#1255aa");
  await page.getByRole("button", { name: "保存为新主题", exact: true }).click();
  await expect(page.locator(".saved-theme")).toContainText("自定义主题");
  await expect(page.locator(".saved-theme")).not.toContainText("夜航");
  await expect(page.locator(".theme-detail")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("markdown-studio-draft") || "{}")
            .custom?.base,
      ),
    )
    .toBe("blank");
  await page.reload();
  await expect(page.locator(".preview-pane .article")).toHaveAttribute(
    "data-theme",
    "blank",
  );
  await expect(page.locator(".preview-pane .article h2")).toHaveCSS(
    "color",
    "rgb(18, 85, 170)",
  );
  await openThemes(page);
  await page.getByRole("tab", { name: "内置主题", exact: true }).click();
  const card = page.getByRole("button", { name: "松林主题", exact: true });
  await card.hover();
  await expect(card.getByRole("tooltip")).toHaveText("松绿细线，舒展阅读");
  await page.locator(".panel-title").hover();
  await expect(card.getByRole("tooltip")).toBeHidden();
});
