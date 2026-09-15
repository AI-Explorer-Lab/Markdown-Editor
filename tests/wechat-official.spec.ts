import fs from "node:fs/promises";
import { test, expect, type Browser } from "@playwright/test";

async function verify(browser: Browser, html: string) {
  const page = await browser.newPage();
  try {
    await page.addScriptTag({ path: "tests/vendor/wechat/checker.js" });
    return await page.evaluate(async (html) => {
      const root = document.createElement("div");
      root.innerHTML = html;
      return (window as any).OfficialChecker.verifyArticleStructure(root);
    }, html);
  } finally {
    await page.close();
  }
}

test("official checker reproduces mixed-text failures; text runs fix them without changing layout", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  const { before, after } = await page.evaluate(async () => {
    const { normalizeWechatTextRuns } = await import("/src/wechat.ts");
    const root = document.createElement("article");
    root.style.cssText =
      "font-size:16px;line-height:1.8;font-family:sans-serif;color:#333";
    root.innerHTML = `<p>试试切换右侧的 <strong>10 种排版主题</strong>。同样的文字，也可以有不同的气质。</p>
      <p>行内公式：<img alt="E=mc²" width="65" height="24" style="vertical-align:middle" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='65' height='24'%3E%3Ctext y='18'%3EE=mc²%3C/text%3E%3C/svg%3E">。</p>
      <p>支持粘贴截图、拖拽或上传图片。首次保存时给文章起个名字，之后按 <strong>⌘S / Ctrl+S</strong> 更新同一份文件。</p>
      <p>这是一篇示例文章，你可以直接修改。<sup><a>[1]</a></sup></p>
      <p>文章保存到本项目的 paper 文件夹，图片保存在 paper/assets 中。 <a>↩︎</a></p>`;
    root.querySelectorAll<HTMLElement>("p").forEach((p) => {
      p.style.fontSize = "16px";
      p.style.lineHeight = "1.8";
    });
    const before = root.outerHTML;
    normalizeWechatTextRuns(root);
    return { before, after: root.outerHTML };
  });
  const original = await verify(browser, before);
  expect(original.isValid).toBe(false);
  expect(
    new Set(
      original.inValidInfo["line-height"].items.map((i: any) =>
        Number(i.paragraphIndex),
      ),
    ).size,
  ).toBe(5);
  const fixed = await verify(browser, after);
  expect(fixed).toEqual({ isValid: true, inValidInfo: {} });
  for (const width of [320, 375, 677]) {
    const measurements = [];
    for (const html of [before, after]) {
      await page.setContent(
        `<style>body{margin:0;width:${width}px}</style>${html}`,
      );
      await page
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.decode());
      measurements.push(
        await page.locator("article").evaluate((root) => {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          const boxes: number[][] = [];
          while (walker.nextNode()) {
            const text = walker.currentNode;
            for (let i = 0; i < (text.textContent?.length || 0); i++) {
              const range = document.createRange();
              range.setStart(text, i);
              range.setEnd(text, i + 1);
              const r = range.getBoundingClientRect();
              boxes.push([r.x, r.y, r.width, r.height]);
            }
          }
          return {
            text: root.textContent,
            boxes,
            height: root.getBoundingClientRect().height,
          };
        }),
      );
    }
    expect(measurements[1], `${width}px text positions preserved`).toEqual(
      measurements[0],
    );
  }
});

test("actual clipboard article passes the unmodified official checker across all themes", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: async (items: ClipboardItem[]) => {
        (window as any).__wechat = await (
          await items[0].getType("text/html")
        ).text();
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .fill(await fs.readFile("tests/fixtures/wechat-amber-report.md", "utf8"));
  await expect(page.locator(".article .diagram svg")).toContainText("分享文章");
  const findings: Record<string, unknown> = {};
  for (const theme of [
    "琥珀",
    "素白",
    "墨书",
    "海盐",
    "松林",
    "赤陶",
    "紫藤",
    "极客",
    "报刊",
    "夜航",
  ]) {
    await page
      .getByRole("button", { name: theme + "主题", exact: true })
      .click();
    await page.evaluate(() => {
      (window as any).__wechat = "";
    });
    await page
      .getByRole("button", { name: "复制到公众号", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__wechat || ""))
      .toContain("把想法写成文章");
    const html = await page.evaluate(() => (window as any).__wechat as string);
    const result = await verify(browser, html);
    findings[theme] = result;
    expect.soft(result, theme).toEqual({ isValid: true, inValidInfo: {} });
    const structure = await page.evaluate((html) => {
      const root = document.createElement("div");
      root.innerHTML = html;
      return {
        images: root.querySelectorAll("img").length,
        bold: [...root.querySelectorAll("strong")].map((s) => s.textContent),
        footnote: root.querySelector(".footnotes")?.textContent,
      };
    }, html);
    expect(structure.images).toBe(3);
    expect(structure.bold).toContain("10 种排版主题");
    expect(structure.bold).toContain("⌘S / Ctrl+S");
    expect(structure.footnote).toContain("paper/assets");
    if (theme === "琥珀") {
      // Model the leaf wrappers observed in the user's pasted HTML, then their
      // removal during serialization. The ordinary styled runs must survive.
      const roundTrips = await page.evaluate((html) => {
        const root = document.createElement("div");
        root.innerHTML = html;
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const texts = [];
        while (walk.nextNode()) texts.push(walk.currentNode);
        for (const text of texts) {
          if (!text.textContent?.trim()) continue;
          const span = document.createElement("span");
          span.setAttribute("leaf", "");
          text.replaceWith(span);
          span.append(text);
        }
        const withLeaves = root.innerHTML;
        root
          .querySelectorAll("span[leaf]")
          .forEach((span) => span.replaceWith(...span.childNodes));
        return [withLeaves, root.innerHTML];
      }, html);
      for (const roundTrip of roundTrips)
        expect(await verify(browser, roundTrip)).toEqual({
          isValid: true,
          inValidInfo: {},
        });
      await test
        .info()
        .attach("amber-wechat-html", { body: html, contentType: "text/html" });
    }
  }
  await test
    .info()
    .attach("official-checker-results", {
      body: JSON.stringify(findings, null, 2),
      contentType: "application/json",
    });
});
