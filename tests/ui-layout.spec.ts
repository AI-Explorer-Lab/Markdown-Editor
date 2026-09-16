import { test, expect } from "@playwright/test";
test("unified article navigation, customization preview and compact toolbar", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "打开", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "文章历史", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导入本地 Markdown" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "主题", exact: true }).click();
  const selectionPanel = await page.locator("#theme-popover").boundingBox();
  expect(selectionPanel!.x).toBe(page.viewportSize()!.width / 2);
  expect(selectionPanel!.width).toBe(page.viewportSize()!.width / 2);
  const original = await page
    .locator(".preview-pane .article")
    .getAttribute("data-theme");
  await page.getByRole("button", { name: "海盐主题", exact: true }).click();
  await expect(page.locator(".preview-pane .article")).toHaveAttribute(
    "data-theme",
    original!,
  );
  await page.getByRole("button", { name: "关闭主题面板" }).click();
  await page.getByRole("button", { name: "主题", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "应用这个风格" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "海盐主题", exact: true }).click();
  await page.getByRole("button", { name: "应用这个风格" }).click();
  await expect(page.locator(".preview-pane .article")).toHaveAttribute(
    "data-theme",
    "sea",
  );
  await page.getByRole("button", { name: "基于此主题定制" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/customizing/);
  const panel = await page.locator("#theme-popover").boundingBox();
  const preview = await page.locator(".preview-pane").boundingBox();
  expect(preview!.x + preview!.width).toBeLessThanOrEqual(panel!.x);
  await expect(page.getByLabel("正文颜色选色", { exact: true })).toHaveValue(
    "#343d39",
  );
  await page.getByLabel("正文颜色", { exact: true }).fill("#123456");
  await expect(page.getByLabel("正文颜色选色", { exact: true })).toHaveValue(
    "#123456",
  );
  await page.getByRole("button", { name: "重置正文颜色", exact: true }).click();
  await expect(page.getByLabel("正文颜色选色", { exact: true })).toHaveValue(
    "#343d39",
  );
  await page.getByRole("button", { name: "关闭主题面板" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "主题", exact: true }).click();
  await expect(page.locator(".editing-pane")).toBeHidden();
  const mobilePreview = await page.locator(".preview-pane").boundingBox();
  const mobilePanel = await page.locator("#theme-popover").boundingBox();
  expect(mobilePreview!.x).toBeGreaterThanOrEqual(0);
  expect(mobilePreview!.y + mobilePreview!.height).toBeLessThanOrEqual(
    mobilePanel!.y,
  );
  await page.getByRole("button", { name: "关闭主题面板" }).click();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await expect(
    page
      .getByRole("button", { name: "复制到知乎", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
