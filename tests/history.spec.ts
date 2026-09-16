import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("history restores file themes; new title creates immediately and collisions preserve existing files", async ({
  page,
  request,
}) => {
  const prefix = "history-" + Date.now();
  const first = prefix + "-原文",
    fresh = prefix + "-新文",
    legacy = prefix + "-旧文";
  const appearance = {
    theme: "plain",
    custom: {
      version: 1,
      base: "plain",
      name: "独立配色",
      values: { accent: "#891254" },
    },
    fontSize: 18,
    lineHeight: 2,
  };
  try {
    expect(
      (
        await request.put("/api/papers", {
          data: { name: first, content: "## 已有文章\n\n第一篇", appearance },
        })
      ).ok(),
    ).toBeTruthy();
    await fs.writeFile(`paper/${legacy}.md`, "## 旧文章");
    await page.goto("/");
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "文章历史", exact: true }).click();
    const history = page.getByRole("complementary", {
      name: "文章历史",
      exact: true,
    });
    await history.getByRole("button", { name: first, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "已有文章", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".article h2")).toHaveText("已有文章");
    await expect(page.locator(".article h2")).toHaveCSS(
      "color",
      "rgb(137, 18, 84)",
    );
    await page
      .locator(".app-header")
      .getByRole("button", { name: "新建文章", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "文章标题", exact: true })
      .fill(fresh);
    await page.getByRole("radio", { name: "夜航", exact: true }).click();
    await page.getByRole("button", { name: "创建文章", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      history.getByRole("button", { name: fresh, exact: true }),
    ).toBeVisible();
    expect(await fs.readFile(`paper/${fresh}.md`, "utf8")).toBe("");
    expect(
      JSON.parse(await fs.readFile(`paper/.styles/${fresh}.md.json`, "utf8"))
        .theme,
    ).toBe("night");
    await page
      .getByRole("textbox", { name: "Markdown 源码" })
      .fill("## 新文内容");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.locator(".save-status")).toHaveText("已保存");
    await history.getByRole("button", { name: first, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "已有文章", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".article h2")).toHaveText("已有文章");
    await expect(page.locator(".article h2")).toHaveCSS(
      "color",
      "rgb(137, 18, 84)",
    );
    await page
      .locator(".app-header")
      .getByRole("button", { name: "新建文章", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "文章标题", exact: true })
      .fill(fresh);
    await page.getByRole("button", { name: "创建文章", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "文件已存在",
    );
    expect(await fs.readFile(`paper/${fresh}.md`, "utf8")).toBe("## 新文内容");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "已有文章", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".article h2")).toHaveText("已有文章");
    await history.getByRole("button", { name: fresh, exact: true }).click();
    await expect(page.locator(".article")).toHaveAttribute(
      "data-theme",
      "night",
    );
    await history.getByRole("button", { name: legacy, exact: true }).click();
    await expect(page.locator(".article")).toHaveAttribute(
      "data-theme",
      "forest",
    );
    await expect(page.locator(".article h2")).toHaveText("旧文章");
  } finally {
    for (const name of [first, fresh, legacy]) {
      await fs.rm(`paper/${name}.md`, { force: true });
      await fs.rm(`paper/.styles/${name}.md.json`, { force: true });
    }
  }
});
