import { chromium } from "playwright";
import fs from "node:fs/promises";
const b = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const p = await b.newPage({ viewport: { width: 1586, height: 992 } });
  await p.goto("http://127.0.0.1:5173");
  await p.locator(".article[data-ready=true]").waitFor();
  await p.locator(".article .diagram svg").waitFor();
  await p.screenshot({ path: "plan/design/implemented-desktop.png" });
  for (const [id, name] of [
    ["plain", "素白"],
    ["ink", "墨书"],
    ["sea", "海盐"],
    ["forest", "松林"],
    ["clay", "赤陶"],
    ["violet", "紫藤"],
    ["amber", "琥珀"],
    ["geek", "极客"],
    ["press", "报刊"],
    ["night", "夜航"],
  ]) {
    await p.getByRole("button", { name: name + "主题", exact: true }).click();
    await p
      .locator(".preview-pane")
      .screenshot({ path: `plan/design/theme-${id}.png` });
  }
  await p.getByRole("button", { name: "松林主题", exact: true }).click();
  await p.getByRole("button", { name: "导出", exact: true }).click();
  const pdf = p.waitForEvent("download");
  await p.getByRole("button", { name: "PDF 文件" }).click();
  await (await pdf).saveAs("plan/design/sample-output.pdf");
  console.log("PDF and ten theme screenshots saved");
  await p.getByRole("button", { name: "导出", exact: true }).click();
  const html = p.waitForEvent("download");
  await p.getByRole("button", { name: "HTML 文件" }).click();
  await (await html).saveAs("plan/design/sample-output.html");
  const offline = await b.newPage();
  await offline.route("**/*", (route) => route.abort());
  await offline.setContent(
    await fs.readFile("plan/design/sample-output.html", "utf8"),
  );
  console.log(
    "offline images:",
    await offline
      .locator("img")
      .evaluateAll((imgs) =>
        imgs.map((i) => ({ complete: i.complete, width: i.naturalWidth })),
      ),
  );
  await offline.screenshot({ path: "plan/design/exported-html.png" });
} finally {
  await b.close();
}
