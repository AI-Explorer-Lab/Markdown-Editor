import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { setAccount } from "../server/auth.mjs";
test("login, automatic save, another device, conflict, backup download and logout", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = "login-test-" + Date.now();
  const credentials = {
    username: process.env.TEST_USERNAME || "test-writer",
    password: process.env.TEST_PASSWORD || "browser-test-only-password",
  };
  let other;
  try {
    await page.goto("/#editor");
    await page.getByRole("button", { name: "进入编辑器", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "登录", exact: true }),
    ).toBeVisible();
    expect((await page.request.get("/api/papers")).status()).toBe(401);
    await page.getByLabel("账号", { exact: true }).fill(credentials.username);
    await page.getByLabel("密码", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("账号或密码不正确");
    await page.getByLabel("密码", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Markdown 源码" }),
    ).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .locator(".app-header")
      .getByRole("button", { name: "新建文章", exact: true })
      .click();
    await page.getByLabel("文章标题", { exact: true }).fill(name);
    await page.getByRole("button", { name: "创建文章", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".document-name")).toHaveText(name + ".md");
    await page
      .getByRole("textbox", { name: "Markdown 源码" })
      .fill("# 跨设备正文\n\n自动保存的内容");
    await expect(page.locator(".save-status")).toHaveText("已保存", {
      timeout: 10000,
    });
    await page.reload();
    await page.getByRole("button", { name: "继续上次编辑", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Markdown 源码" }),
    ).toBeVisible();
    other = await browser.newContext({ baseURL });
    await other.request.post("/api/auth/login", { data: credentials });
    const second = await other.newPage();
    await second.goto("/#editor");
    await second.getByRole("button", { name: "进入编辑器", exact: true }).click();
    await second.getByRole("button", { name: "文章历史", exact: true }).click();
    second.on("dialog", (dialog) => dialog.accept());
    await second
      .getByRole("complementary", { name: "文章历史", exact: true })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(
      second.getByRole("textbox", { name: "Markdown 源码" }),
    ).toHaveText("# 跨设备正文\n\n自动保存的内容", { useInnerText: true });
    const original = await (
      await other.request.get("/api/papers/" + encodeURIComponent(name + ".md"))
    ).json();
    const externalSave = await other.request.put("/api/papers", {
      data: {
        name,
        content: "另一个窗口的新正文",
        baseRevision: original.revision,
      },
    });
    expect(externalSave.status()).toBe(200);
    await page
      .getByRole("textbox", { name: "Markdown 源码" })
      .fill("我的未保存修改");
    await expect(page.locator(".save-status")).toHaveText(
      "保存失败，请手动重试",
      { timeout: 10000 },
    );
    await expect(
      page.getByRole("textbox", { name: "Markdown 源码" }),
    ).toHaveText("我的未保存修改");
    expect(
      (
        await (
          await other.request.get(
            "/api/papers/" + encodeURIComponent(name + ".md"),
          )
        ).json()
      ).content,
    ).toBe("另一个窗口的新正文");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载完整备份", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe("markdown-backup.tar.gz");
    const oldState = await page.context().storageState();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "登录", exact: true }),
    ).toBeVisible();
    const stolen = await browser.newContext({
      baseURL,
      storageState: oldState,
    });
    expect((await stolen.request.get("/api/papers")).status()).toBe(401);
    await stolen.close();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: ".deploy/login-mobile.png", fullPage: true });
  } finally {
    await other?.close();
    await fs.rm(`paper/${name}.md`, { force: true });
    await fs.rm(`paper/.styles/${name}.md.json`, { force: true });
  }
});
test("account settings change credentials and revoke another browser", async ({
  page,
  browser,
  baseURL,
}) => {
  if (
    !baseURL?.startsWith("http://127.0.0.1:") &&
    !baseURL?.startsWith("http://localhost:")
  )
    throw new Error("Use an isolated local test server");
  const username = process.env.TEST_USERNAME || "test-writer";
  const password = process.env.TEST_PASSWORD || "browser-test-only-password";
  const changed = "changed-browser-test-password";
  const other = await browser.newContext({ baseURL });
  try {
    await page.request.post("/api/auth/login", {
      data: { username, password },
    });
    await other.request.post("/api/auth/login", {
      data: { username, password },
    });
    await page.goto("/#editor");
    await page.getByRole("button", { name: "进入编辑器", exact: true }).click();
    await page.getByRole("button", { name: "账号设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "账号设置" });
    await dialog.getByLabel("当前密码", { exact: true }).fill(password);
    await dialog.getByLabel("新密码", { exact: true }).fill(changed);
    await dialog.getByLabel("确认新密码", { exact: true }).fill(changed);
    await dialog.getByRole("button", { name: "保存账号设置" }).click();
    await expect(
      page.getByRole("button", { name: "登录", exact: true }),
    ).toBeVisible();
    expect((await other.request.get("/api/papers")).status()).toBe(401);
    expect(
      (
        await other.request.post("/api/auth/login", {
          data: { username, password },
        })
      ).status(),
    ).toBe(401);
    await page.getByLabel("密码", { exact: true }).fill(changed);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Markdown 源码" }),
    ).toBeVisible();
  } finally {
    await other.close();
    await setAccount("paper/.private", username, password);
  }
});
