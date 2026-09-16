import type { Page } from "@playwright/test";
export async function openThemes(page: Page) {
  if (!(await page.locator("#theme-popover").isVisible()))
    await page.getByRole("button", { name: "主题", exact: true }).click();
}
