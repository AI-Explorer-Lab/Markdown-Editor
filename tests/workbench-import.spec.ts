import { test, expect } from "@playwright/test";

for (const loggedIn of [true, false]) {
  test(
    "workbench import preserves body, existing draft and appearance " +
      (loggedIn ? "with session" : "through login"),
    async ({ page, context, baseURL }) => {
      if (!baseURL || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseURL))
        throw new Error("Local QA service required");
      const article = {
        title: "冬天来了",
        body: "第一段。\n\n## 天色\n\n- 梧桐\n- 冬阳\n",
      };
      const credentials = {
        username: process.env.TEST_USERNAME || "test-writer",
        password: process.env.TEST_PASSWORD || "browser-test-only-password",
      };
      if (loggedIn)
        expect(
          (
            await page.request.post("/api/auth/login", { data: credentials })
          ).ok(),
        ).toBeTruthy();
      await page.goto("/");
      await page.evaluate(() => {
        localStorage.setItem(
          "markdown-studio-draft",
          JSON.stringify({
            source: "未保存的旧草稿",
            name: "",
            saved: "",
            revision: null,
            theme: "ink",
            custom: null,
            fontSize: 17,
            lineHeight: 1.9,
          }),
        );
      });
      const openerOrigin = "http://localhost:19388";
      const editorOrigin = new URL(baseURL).origin;
      const id = "7eef4c28-5d2a-410d-b939-318355e593f7";
      await context.route(openerOrigin + "/fixture", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<button id="open">Export</button><output></output>',
        }),
      );
      await page.goto(openerOrigin + "/fixture");
      await page.evaluate(
        ({ id, article, editorOrigin }) => {
          let editor: Window | null = null;
          document.querySelector("button")!.onclick = () => {
            editor = window.open(
              editorOrigin +
                "/#workbench-import=" +
                id +
                "&origin=" +
                encodeURIComponent(location.origin),
            );
          };
          window.addEventListener("message", (event) => {
            if (
              event.source !== editor ||
              event.origin !== editorOrigin ||
              event.data.id !== id
            )
              return;
            if (event.data.type === "markdown-editor:ready") {
              editor!.postMessage(
                {
                  type: "workbench:article",
                  id: "invalid",
                  title: "ignored",
                  body: "wrong",
                },
                editorOrigin,
              );
              editor!.postMessage(
                { type: "workbench:article", id, ...article },
                editorOrigin,
              );
            }
            if (event.data.type === "markdown-editor:received")
              document.querySelector("output")!.textContent = "received";
          });
        },
        { id, article, editorOrigin },
      );
      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        page.getByRole("button", { name: "Export" }).click(),
      ]);
      await expect(page.locator("output")).toHaveText("received");
      await expect(popup).toHaveURL(editorOrigin + "/#editor");
      if (!loggedIn) {
        await popup
          .getByLabel("账号", { exact: true })
          .fill(credentials.username);
        await popup
          .getByLabel("密码", { exact: true })
          .fill(credentials.password);
        await popup.getByRole("button", { name: "登录", exact: true }).click();
      }
      await expect(popup.locator(".document-name")).toHaveText(article.title);
      const editor = popup.getByRole("textbox", { name: "Markdown 源码" });
      await expect(editor).toContainText("第一段。");
      await expect(popup.locator("article h2")).toHaveText("天色");
      await expect(popup.locator("article h1")).toHaveCount(0);
      const stored = await popup.evaluate(() => ({
        old: JSON.parse(
          localStorage.getItem("markdown-studio-draft") || "null",
        ),
        imported: JSON.parse(
          sessionStorage.getItem("markdown-studio-workbench-draft") || "null",
        ),
      }));
      expect(stored.old.source).toBe("未保存的旧草稿");
      expect(stored.imported).toMatchObject({
        theme: "ink",
        fontSize: 17,
        lineHeight: 1.9,
        source: article.body,
        suggestedTitle: article.title,
      });
      await popup.keyboard.press("Control+s");
      await expect(popup.getByRole("dialog").locator("input")).toHaveValue(
        article.title,
      );
      if (loggedIn) {
        const name = "workbench-import-test-" + Date.now();
        const prior = await popup.request.put("/api/papers", {
          data: { name, content: "原文保留", baseRevision: null },
        });
        expect(prior.ok()).toBe(true);
        const saveDialog = popup.getByRole("dialog");
        await saveDialog.getByLabel("文件名").fill(name);
        await saveDialog.getByRole("button", { name: "保存文章" }).click();
        await expect(
          popup.getByText(/文件已存在或已被其他窗口修改/),
        ).toBeVisible();
        expect(
          (await (await popup.request.get("/api/papers/" + name)).json())
            .content,
        ).toBe("原文保留");
        await saveDialog.getByLabel("文件名").fill(name + "-copy");
        await saveDialog.getByRole("button", { name: "保存文章" }).click();
        await expect(saveDialog).toHaveCount(0);
        const saved = await (
          await popup.request.get("/api/papers/" + name + "-copy")
        ).json();
        expect(saved.content).toBe(article.body);
        expect(saved.appearance.theme).toBe("ink");
      }
      const fresh = await context.newPage();
      await fresh.goto("/#editor");
      await expect(fresh.locator(".home-page")).toBeVisible();
      await fresh.getByRole("button", { name: "继续上次编辑" }).click();
      await expect(
        fresh.getByRole("textbox", { name: "Markdown 源码" }),
      ).toContainText("未保存的旧草稿");
    },
  );
}
