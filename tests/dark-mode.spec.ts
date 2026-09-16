import { test, expect } from "@playwright/test";

test("interface dark mode persists and leaves article and clipboard styling unchanged", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .fill("# 标题\n\n## 子标题\n\n**正文** 与内容");
  await expect(page.locator(".article")).toHaveAttribute("data-ready", "true");
  const read = () =>
    page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return (await items[0].getType("text/html")).text();
    });
  await page.getByRole("button", { name: "复制到公众号", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("已复制");
  const light = await read();
  const source = await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .innerText();
  await page
    .getByRole("button", { name: "切换到黑暗模式", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-color-mode",
    "dark",
  );
  await expect(page.locator(".cm-editor")).toHaveCSS(
    "background-color",
    "rgb(23, 32, 30)",
  );
  await expect(page.locator(".article")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.evaluate(() => navigator.clipboard.writeText("pending dark copy"));
  await page.getByRole("button", { name: "复制到公众号", exact: true }).click();
  await expect.poll(() => read().catch(() => "clipboard updating")).toBe(light);
  expect(
    await page.getByRole("textbox", { name: "Markdown 源码" }).innerText(),
  ).toBe(source);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-color-mode",
    "dark",
  );
  const order = await page
    .locator(".header-actions > button")
    .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")));
  expect(order.indexOf("新建文章")).toBeLessThan(order.indexOf("主题"));
  await page
    .getByRole("button", { name: "切换到浅色模式", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-color-mode",
    "light",
  );
});
