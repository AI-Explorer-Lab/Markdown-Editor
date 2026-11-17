import { test, expect, type Page } from "@playwright/test";

const credentials = {
  username: process.env.TEST_USERNAME || "test-writer",
  password: process.env.TEST_PASSWORD || "browser-test-only-password",
};
async function login(page: Page) {
  expect(
    (await page.request.post("/api/auth/login", { data: credentials })).ok(),
  ).toBeTruthy();
}
test.beforeEach(async ({ baseURL }) => {
  expect(baseURL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
});

test("public homepage matches the concept at desktop and narrow widths", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "写作，从这里开始。",
  );
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "开始写作", exact: true }),
  ).toBeVisible();
  for (const [width, height] of [
    [2560, 1280],
    [2048, 960],
    [1920, 900],
    [1536, 1024],
    [1536, 864],
    [1440, 900],
    [1440, 760],
    [1366, 650],
    [1280, 600],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await expect(
      page.getByRole("button", { name: "开始写作", exact: true }),
    ).toBeInViewport();
    if (width > 1000) {
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBeLessThanOrEqual(height);
      const footer = await page.locator(".home-footer").boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(height + 1);
    }
    if (width === 1536 || width === 390)
      await page.screenshot({
        path: `.deploy/homepage-20261117/home-${width}.png`,
        fullPage: true,
      });
  }
  expect(errors).toEqual([]);
});

test("guide supports keyboard dismissal and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "使用指南", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "使用指南" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("new article intent survives login, saves, and returns to homepage", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始写作", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await page.getByLabel("账号", { exact: true }).fill(credentials.username);
  await page.getByLabel("密码", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "新建文章", exact: true });
  await expect(modal).toBeVisible();
  const name = "homepage-new-" + Date.now();
  await modal.getByLabel("文章标题", { exact: true }).fill(name);
  await modal.getByRole("button", { name: "创建文章", exact: true }).click();
  await expect(modal).toHaveCount(0);
  const editor = page.getByRole("textbox", { name: "Markdown 源码" });
  await expect(editor).toHaveText("");
  await editor.fill("# 首页接入验证\n\n需要保留的内容");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await expect(page.locator(".home-page")).toBeVisible();
  await expect(editor).toBeHidden();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/papers/" + name + ".md")).json())
          .content,
    )
    .toContain("需要保留的内容");
  await page.getByRole("button", { name: "继续上次编辑", exact: true }).click();
  await expect(editor).toContainText("需要保留的内容");
  await page.reload();
  await expect(editor).toContainText("需要保留的内容");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.goBack();
  await expect(editor).toBeVisible();
  await page.goForward();
  await expect(page.locator(".home-page")).toBeVisible();
});

test("home preserves an unsaved draft, and its shortcuts cannot open hidden editor dialogs", async ({
  page,
}) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("button", { name: "继续上次编辑", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown 源码" });
  await editor.fill("未命名草稿必须保留");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.keyboard.press("Control+s");
  await page.getByRole("button", { name: "继续上次编辑", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editor).toHaveText("未命名草稿必须保留");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("markdown-studio-draft") || "null")
            ?.source,
      ),
    )
    .toBe("未命名草稿必须保留");
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.locator(".home-page")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.getByRole("button", { name: "继续上次编辑", exact: true }).click();
  await expect(editor).toHaveText("未命名草稿必须保留");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.getByRole("button", { name: "开始写作", exact: true }).click();
  await page
    .getByRole("dialog", { name: "新建文章" })
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(editor).toHaveText("未命名草稿必须保留");
});

test("open document loads saved articles and imports local Markdown", async ({
  page,
}) => {
  await login(page);
  const name = "homepage-open-" + Date.now();
  expect(
    (
      await page.request.put("/api/papers", {
        data: { name, content: "# 历史文章验证", baseRevision: null },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "打开文档", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "打开文章", exact: true });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("textbox", { name: "Markdown 源码" })).toHaveText(
    "# 历史文章验证",
  );
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.getByRole("button", { name: "打开文档", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await modal.getByRole("button", { name: "导入本地 Markdown" }).click();
  await (
    await chooser
  ).setFiles({
    name: "import.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 导入的内容", "utf8"),
  });
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Markdown 源码" })).toHaveText(
    "# 导入的内容",
  );
});

test("login can return home and mobile can enter the editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "开始写作", exact: true }).click();
  await page.getByRole("button", { name: "返回首页" }).click();
  await expect(page.locator(".home-page")).toBeVisible();
  await login(page);
  await page.reload();
  await page.getByRole("button", { name: "开始写作", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "新建文章" })).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
});

test("article contents links stay inside the editor", async ({ page }) => {
  await login(page);
  await page.goto("/#editor");
  const editor = page.getByRole("textbox", { name: "Markdown 源码" });
  await editor.fill("# 测试目录\n\n[TOC]\n\n## 第一节\n\n正文");
  await page
    .locator(".article .toc")
    .getByRole("link", { name: "第一节", exact: true })
    .click();
  await expect(editor).toBeVisible();
  await expect(page.locator(".home-page")).toHaveCount(0);
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(editor).toBeVisible();
});

test("starting an article during an ongoing save opens the dialog after saving", async ({
  page,
}) => {
  await login(page);
  const name = "homepage-saving-" + Date.now();
  await page.request.put("/api/papers", {
    data: { name, content: "# 原文", baseRevision: null },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "打开文档", exact: true }).click();
  await page
    .getByRole("dialog", { name: "打开文章" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
  let releaseSave!: () => void;
  const waitForRelease = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await expect(page.getByRole("textbox", { name: "Markdown 源码" })).toHaveText(
    "# 原文",
  );
  await page.route("**/api/papers", async (route) => {
    if (route.request().method() === "PUT") await waitForRelease;
    await route.continue();
  });
  await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .fill("# 更新后的正文");
  const saving = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/papers") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await saving;
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.getByRole("button", { name: "开始写作", exact: true }).click();
  releaseSave();
  await expect(page.getByRole("dialog", { name: "新建文章" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Markdown 源码" })).toHaveText(
    "# 更新后的正文",
  );
});
