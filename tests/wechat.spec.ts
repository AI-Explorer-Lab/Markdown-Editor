import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("all themes copy to WeChat without gradients, nonstandard alignment or cramped line heights", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__copied = [];
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: async (items: ClipboardItem[]) => {
        (window as any).__copied.push(
          await (await items[0].getType("text/html")).text(),
        );
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".article")).toHaveAttribute("data-ready", "true");
  const source =
    "# 标题\n\n## 标题装饰\n\n段落 **加粗** 和 *斜体*。\n\n> 第一行引用\n>\n> 第二行引用\n\n- [x] 任务\n- 普通列表\n\n| 左 | 中 | 右 |\n| :-- | :-: | --: |\n| 一 | 二 | 三 |\n\n```js\nconst answer = 42;\nconsole.log(answer);\n```\n\n脚注[^1]\n\n[^1]: 脚注内容";
  await page.getByRole("textbox", { name: "Markdown 源码" }).fill(source);
  await expect(page.locator(".article h1")).toHaveText("标题");
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
    await page
      .getByRole("button", { name: "复制到公众号", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__copied.length))
      .toBe(Object.keys(findings).length + 1);
    await expect(
      page.getByRole("button", { name: "复制到公众号", exact: true }),
    ).toBeEnabled();
    const result = await page.evaluate(async () => {
      const html = (window as any).__copied.at(-1);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const elements = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));
      return {
        gradients: elements
          .filter((e) => /gradient\(/i.test(e.style.cssText))
          .map((e) => e.tagName),
        alignment: elements
          .filter(
            (e) =>
              e.style.textAlign &&
              !["left", "right", "center", "justify"].includes(
                e.style.textAlign,
              ),
          )
          .map((e) => e.tagName + ":" + e.style.textAlign),
        lineHeight: elements
          .filter((e) => e.tagName !== "IMG" && (!/^\d+(?:\.\d+)?$/.test(e.style.lineHeight) || Number(e.style.lineHeight) < 1.6))
          .map((e) => e.tagName + ":" + e.style.lineHeight),
        text: doc.body.textContent,
        columns: elements
          .filter((e) => e.tagName === "TH")
          .map((e) => e.style.textAlign),
        heading: doc.querySelector("h2")?.getAttribute("style"),
      };
    });
    findings[theme] = result;
    expect.soft(result.gradients, theme + " gradient").toEqual([]);
    expect.soft(result.alignment, theme + " text-align").toEqual([]);
    expect.soft(result.lineHeight, theme + " line-height").toEqual([]);
    expect(result.columns).toEqual(["left", "center", "right"]);
    expect(result.text).toContain("console.log(answer)");
  }
  await test.info().attach("wechat-style-audit", {
    body: JSON.stringify(findings, null, 2),
    contentType: "application/json",
  });
});

test("WeChat sets scalable line heights and logical alignment while HTML keeps original styles", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .fill("# 标题\n\n## 琥珀装饰\n\n段落第一行\n\n右对齐段落\n\n结束");
  await page.getByRole("button", { name: "琥珀主题", exact: true }).click();
  await expect(page.locator(".article")).toHaveAttribute("data-ready", "true");
  const result = await page.evaluate(async () => {
    // Browser-side integration test against the real adapter, including hostile inherited styles.
    const { prepareArticle } = await import("/src/export.ts");
    const article = document.querySelector<HTMLElement>(".article")!;
    const paragraphs = article.querySelectorAll<HTMLElement>("p");
    paragraphs[0].style.lineHeight = "0px";
    paragraphs[0].style.fontSize = "24px";
    paragraphs[1].style.direction = "rtl";
    paragraphs[1].style.textAlign = "start";
    paragraphs[2].style.direction = "rtl";
    paragraphs[2].style.textAlign = "end";
    const before = article.innerHTML;
    const wechat = await prepareArticle(article, "wechat");
    const html = await prepareArticle(article, "html");
    const parse = (s: string) =>
      new DOMParser().parseFromString(s, "text/html");
    const w = parse(wechat.html),
      h = parse(html.html);
    return {
      unchanged: before === article.innerHTML,
      lineHeight: w.querySelector<HTMLElement>("p")!.style.lineHeight,
      aligns: Array.from(
        w.querySelectorAll<HTMLElement>("p"),
        (p) => p.style.textAlign,
      ),
      originalLineHeight: h.querySelector<HTMLElement>("p")!.style.lineHeight,
      originalGradient:
        h.querySelector<HTMLElement>("h2")!.style.backgroundImage,
      border: w.querySelector<HTMLElement>("h2")!.style.borderBottom,
      html: wechat.html,
    };
  });
  expect(result.unchanged).toBe(true);
  expect(result.lineHeight).toBe("1.6");
  expect(result.aligns).toEqual(["left", "right", "left"]);
  expect(result.originalLineHeight).toBe("0px");
  expect(result.originalGradient).toContain("linear-gradient");
  expect(result.border).toContain("5px solid");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.setContent(
    "<style>body{margin:20px}*{font-size:24px!important}</style>" + result.html,
  );
  expect(
    await page.locator("article *").evaluateAll((els) =>
      els
        .filter((e) => {
          const s = getComputedStyle(e);
          return parseFloat(s.lineHeight) < parseFloat(s.fontSize);
        })
        .map((e) => e.tagName),
    ),
  ).toEqual([]);
  await page.screenshot({ path: "plan/design/wechat-amber-mobile.png" });
});

test("reported amber article preserves readable nested mobile text", async ({
  page,
}) => {
  const source = await fs.readFile(
    "tests/fixtures/wechat-amber-report.md",
    "utf8",
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: async (items: ClipboardItem[]) => {
        (window as any).__reportedHtml = await (
          await items[0].getType("text/html")
        ).text();
      },
    });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Markdown 源码" }).fill(source);
  await page.getByRole("button", { name: "琥珀主题", exact: true }).click();
  await expect(page.locator(".article .diagram svg")).toContainText("分享文章");
  await page.getByRole("button", { name: "复制到公众号", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__reportedHtml || ""))
    .toContain("把想法写成文章");
  const html = await page.evaluate(
    () => (window as any).__reportedHtml as string,
  );
  await test.info().attach("reported-article-wechat-html", {
    body: html,
    contentType: "text/html",
  });
  await page.setContent(
    "<style>body{margin:16px}img{max-width:100%}</style>" + html,
  );
  expect(await page.locator("article img").count()).toBe(3);
  await expect(page.locator("pre")).toContainText("def greet(name: str)");
  await expect(page.locator("table strong")).toHaveText("加粗");
  await expect(page.locator(".footnotes")).toContainText("文章保存到本项目的 paper 文件夹");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    const violations = await page
      .locator("article,article *")
      .evaluateAll((elements) =>
        elements.flatMap((e) => {
          const node = e as HTMLElement;
          const s = getComputedStyle(node);
          if (!node.textContent?.trim()) return [];
          const line = parseFloat(s.lineHeight),
            font = parseFloat(s.fontSize);
          const unsafeLineHeight = !Number.isFinite(line) || line < font;
          return unsafeLineHeight
            ? [{ tag: node.tagName, line, font, inline: node.style.lineHeight }]
            : [];
        }),
      );
    expect(violations, `${width}px nested line heights`).toEqual([]);
  }
  await page.screenshot({
    path: "plan/design/wechat-reported-article.png",
    fullPage: true,
  });
});

// Text fragments sharing a row must not be counted as separate lines.
// This regression intentionally includes a genuinely overlapping control.
test("mixed inline fragments are not extra lines; real overlapping rows fail", async ({ page }) => {
  for (const width of [375, 677]) {
    await page.setContent(`<main style="width:${width}px;font:16px/1.6 sans-serif">
      <p id="mixed"><span leaf>试试切换右侧的 </span><strong><span leaf>10 种排版主题</span></strong><span leaf>。同样的文字，也可以有不同的气质。</span></p>
      <p id="broken" style="line-height:.5">第一行文字<br>第二行文字<br>第三行文字</p>
      <p id="single" style="line-height:.5">只有一行</p>
      <p id="image" style="line-height:0"><img width="20" height="20" alt=""></p>
    </main>`);
    const results = await page.locator("p").evaluateAll(nodes => nodes.map(node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rawRects = [...range.getClientRects()].filter(r => r.height > 0);
      const font = parseFloat(getComputedStyle(node).fontSize);
      const legacyFlag = rawRects.length >= 2 && range.getBoundingClientRect().height / rawRects.length < font * .95;
      // Walk text nodes to avoid counting both an inline element and its text.
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const tops: number[] = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue;
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) {
          if (rect.height > 0 && !tops.some(top => Math.abs(top - rect.top) < 2)) tops.push(rect.top);
        }
      }
      tops.sort((a, b) => a - b);
      const overlap = tops.some((top, i) => i > 0 && top - tops[i - 1] < font * .95);
      return { id: node.id, legacyFlag, overlap, rows: tops.length };
    }));
    expect(results.find(r => r.id === "mixed")!.legacyFlag).toBe(true);
    expect(results.find(r => r.id === "mixed")!.overlap).toBe(false);
    expect(results.find(r => r.id === "broken")!.overlap).toBe(true);
    expect(results.find(r => r.id === "single")!.overlap).toBe(false);
    expect(results.find(r => r.id === "image")!.overlap).toBe(false);
  }
});
