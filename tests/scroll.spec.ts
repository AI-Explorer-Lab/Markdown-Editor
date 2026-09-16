import { test, expect } from "@playwright/test";

test("split view synchronizes both ways and can be disabled", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Markdown 源码" })
    .fill(
      Array.from(
        { length: 60 },
        (_, i) =>
          `## 第 ${i + 1} 节\n\n${"正文内容与加粗 **重点**。".repeat(8)}\n`,
      ).join("\n"),
    );
  const toggle = page.getByRole("checkbox", { name: "同步滚动" });
  await expect(toggle).toBeChecked();
  const source = page.locator(".cm-scroller");
  const preview = page.locator(".preview-pane");
  const progress = (locator: typeof source) =>
    locator.evaluate(
      (el) => el.scrollTop / (el.scrollHeight - el.clientHeight),
    );
  const move = (locator: typeof source, ratio: number) =>
    locator.evaluate((el, r) => {
      el.scrollTop = r * (el.scrollHeight - el.clientHeight);
    }, ratio);
  await move(source, 0.4);
  await expect
    .poll(async () =>
      Math.abs((await progress(source)) - (await progress(preview))),
    )
    .toBeLessThan(0.01);
  expect(await progress(preview)).toBeGreaterThan(0.3);
  await move(preview, 0.7);
  await expect
    .poll(async () =>
      Math.abs((await progress(source)) - (await progress(preview))),
    )
    .toBeLessThan(0.01);
  expect(await progress(source)).toBeGreaterThan(0.6);
  // Real wheel input must immediately take over from a synchronized scroll.
  await source.hover();
  await page.mouse.wheel(0, -300);
  await expect.poll(() => progress(source)).toBeLessThan(0.69);
  await expect
    .poll(async () =>
      Math.abs((await progress(source)) - (await progress(preview))),
    )
    .toBeLessThan(0.01);
  await move(preview, 1);
  await expect.poll(() => progress(source)).toBeCloseTo(1, 2);
  await move(source, 0);
  await expect.poll(() => progress(preview)).toBe(0);
  await toggle.uncheck();
  await move(preview, 0.5);
  await expect.poll(() => progress(preview)).toBeCloseTo(0.5, 2);
  expect(await progress(source)).toBe(0);
  await toggle.check();
  await expect.poll(() => progress(preview)).toBe(0);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await move(preview, 0.6);
  await page.getByRole("button", { name: "双栏", exact: true }).click();
  await move(preview, 0.3);
  await expect
    .poll(async () =>
      Math.abs((await progress(source)) - (await progress(preview))),
    )
    .toBeLessThan(0.01);
  expect(await progress(source)).toBeGreaterThan(0.2);
});
