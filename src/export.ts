import { toPng } from "html-to-image";
import JSZip from "jszip";
import { isDark } from "./customThemes";
import { normalizeWechatTextRuns } from "./wechat";
export type Output = "html" | "wechat" | "zhihu" | "pdf";
const properties = [
  "color",
  "background-color",
  "background-image",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-indent",
  "text-align",
  "text-decoration",
  "white-space",
  "word-break",
  "overflow-wrap",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "display",
  "vertical-align",
  "list-style-type",
  "border-collapse",
  "box-shadow",
];
const blobData = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

// Computed browser styles are not a portable publishing format. WeChat flags
// logical alignment and text gradients, and may change font sizes on paste.
function applyWechatStyles(copy: HTMLElement, computed: CSSStyleDeclaration) {
  // Explicit unitless spacing survives font-size changes and does not depend
  // on the receiving editor's default CSS. 1.6 is our readability floor,
  // not a threshold mandated by the WeChat specification.
  const fontSize = parseFloat(computed.fontSize);
  const lineHeight = parseFloat(computed.lineHeight);
  const ratio =
    fontSize > 0 && Number.isFinite(lineHeight) ? lineHeight / fontSize : 1.6;
  copy.style.lineHeight = String(Math.max(1.6, ratio));
  const rtl = computed.direction === "rtl";
  const alignment = computed.textAlign;
  copy.style.textAlign = ["left", "right", "center", "justify"].includes(
    alignment,
  )
    ? alignment
    : alignment === "end"
      ? rtl
        ? "left"
        : "right"
      : rtl
        ? "right"
        : "left";

  if (/gradient\(/i.test(computed.backgroundImage)) {
    copy.style.backgroundImage = "none";
    if (
      computed.backgroundImage.includes("rgba(0, 0, 0, 0)") &&
      /^H[1-6]$/.test(copy.tagName)
    ) {
      const colors = computed.backgroundImage.match(/rgb\([^)]+\)/g);
      copy.style.borderBottom = `5px solid ${colors?.at(-1) || computed.color}`;
      copy.style.paddingBottom = "0.12em";
    } else {
      copy.style.backgroundColor =
        computed.getPropertyValue("--soft").trim() || "#f4f4f4";
    }
  }
}

export async function prepareArticle(article: HTMLElement, output: Output) {
  if (article.dataset.ready !== "true")
    throw new Error("图表正在渲染，请稍后重试");
  if (output === "pdf" && article.querySelector(".broken-image"))
    throw new Error("文章包含未能加载的图片，请修复图片后再导出 PDF。");
  await document.fonts.ready;
  const adjustments: string[] = [];
  const clone = article.cloneNode(true) as HTMLElement;
  const originals = [article, ...article.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  originals.forEach((el, i) => {
    const style = getComputedStyle(el),
      copy = copies[i];
    properties.forEach((p) =>
      copy.style.setProperty(p, style.getPropertyValue(p)),
    );
    if (output === "wechat") applyWechatStyles(copy, style);
    if (el.tagName === "IMG") copy.style.maxWidth = "100%";
  });
  if (
    output === "wechat" &&
    originals.some((el) =>
      /gradient\(/i.test(getComputedStyle(el).backgroundImage),
    )
  )
    adjustments.push("渐变已转换为纯色或实线装饰。");
  // Rasterize formulas and diagrams before leaving the page: exported documents need no JS or fonts.
  const visualOriginals = article.querySelectorAll<HTMLElement>(
    ".math-inline,.math-block,.diagram",
  );
  const visualCopies = clone.querySelectorAll<HTMLElement>(
    ".math-inline,.math-block,.diagram",
  );
  for (let i = 0; i < visualOriginals.length; i++) {
    const node = visualOriginals[i];
    if (node.querySelector(".render-error"))
      throw new Error("请先修正公式或图表语法再导出");
    const isInline = node.classList.contains("math-inline");
    const width =
      Math.ceil(
        Math.max(node.scrollWidth, node.getBoundingClientRect().width, 1),
      ) + 2;
    const height =
      Math.ceil(
        Math.max(node.scrollHeight, node.getBoundingClientRect().height, 1),
      ) + 2;
    const src = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(article).backgroundColor,
      width,
      height,
      style: { overflow: "visible", margin: "0" },
      cacheBust: false,
    });
    const image = document.createElement("img");
    image.src = src;
    image.alt = node.dataset.formula || node.dataset.diagram || "图表";
    image.style.cssText = `max-width:100%;height:auto;width:${width}px;vertical-align:middle;display:${isInline ? "inline-block" : "block"};margin:${isInline ? "0" : "16px auto"};`;
    visualCopies[i].replaceWith(image);
  }
  const warnings: string[] = Array.from(
    article.querySelectorAll(".broken-image"),
    (node) => node.textContent || "图片未能加载",
  );
  for (const img of clone.querySelectorAll<HTMLImageElement>("img")) {
    img.removeAttribute("loading");
    if (img.src.startsWith("data:")) continue;
    try {
      const response = await fetch(img.src, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error();
      img.src = await blobData(blob);
    } catch {
      warnings.push(img.alt || img.getAttribute("src") || "图片");
      if (output === "pdf")
        throw new Error(
          "PDF 无法读取图片：" +
            (img.alt || img.src) +
            "。请上传本地图片后重试。",
        );
    }
  }
  clone
    .querySelectorAll<HTMLInputElement>("input[type=checkbox]")
    .forEach((el) => {
      const s = document.createElement("span");
      s.textContent = el.checked ? "☑ " : "☐ ";
      el.replaceWith(s);
    });
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.removeAttribute("id");
    Array.from(el.attributes)
      .filter((a) => a.name.startsWith("data-") || a.name.startsWith("on"))
      .forEach((a) => el.removeAttribute(a.name));
  });
  // Keep anchors for portable HTML/PDF. Platform adapters use readable footnotes without fragile local links.
  if (output === "html" || output === "pdf") {
    const oldIds = article.querySelectorAll("[id]");
    oldIds.forEach((el) => {
      const index = originals.indexOf(el as HTMLElement);
      if (index >= 0 && clone.contains(copies[index])) copies[index].id = el.id;
    });
  }
  if (output === "wechat" || output === "zhihu") {
    clone
      .querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
      .forEach((a) => a.removeAttribute("href"));
    clone.querySelectorAll<HTMLElement>("pre").forEach((p) => {
      p.style.whiteSpace = "pre-wrap";
      p.style.overflowWrap = "anywhere";
    });
    clone
      .querySelectorAll<HTMLElement>("pre code")
      .forEach((p) => (p.style.whiteSpace = "pre-wrap"));
    if (isDark(getComputedStyle(article).backgroundColor)) {
      adjustments.push("深色文章背景已转换为浅色，请检查导出效果。");
      clone.style.backgroundColor = "#fff";
      clone.style.color = "#283a40";
      clone.querySelectorAll<HTMLElement>("*").forEach((e) => {
        e.style.color = "#283a40";
        e.style.backgroundColor = ["PRE", "BLOCKQUOTE", "TH"].includes(
          e.tagName,
        )
          ? "#f1f4f3"
          : "transparent";
        e.style.backgroundImage = "none";
      });
    }
  }
  if (output === "zhihu") {
    clone.style.backgroundColor = "#fff";
    clone.style.color = "#222";
    clone.style.fontFamily = "sans-serif";
    clone
      .querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,blockquote")
      .forEach((el) => {
        el.style.boxShadow = "none";
        el.style.backgroundImage = "none";
        el.style.backgroundColor =
          el.tagName === "BLOCKQUOTE" ? "#f6f6f6" : "transparent";
        el.style.color = "#222";
        el.style.border = "0";
        if (el.tagName === "BLOCKQUOTE") el.style.borderLeft = "3px solid #aaa";
      });
  }
  if (output === "wechat") {
    // Replacement nodes (formula images / task markers) are created after
    // style serialization. Keep text spacing explicit, and images unconstrained.
    [clone, ...clone.querySelectorAll<HTMLElement>("*")].forEach((node) => {
      if (node.tagName === "IMG") {
        node.style.removeProperty("line-height");
      } else {
        const value = node.style.lineHeight;
        node.style.lineHeight = /^\d+(?:\.\d+)?$/.test(value)
          ? String(Math.max(1.6, Number(value)))
          : "1.6";
      }
    });
    normalizeWechatTextRuns(clone);
  }
  clone.removeAttribute("id");
  clone.style.padding = "0";
  clone.style.width = "auto";
  clone.style.maxWidth = "100%";
  return {
    html: clone.outerHTML,
    text: article.innerText,
    warnings,
    adjustments,
    imageCount: clone.querySelectorAll("img").length,
  };
}
export function htmlDocument(html: string, title: string) {
  const safe = title.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe}</title><style>body{max-width:760px;margin:40px auto;padding:0 24px}img{max-width:100%;height:auto}@media print{body{margin:0;padding:0;max-width:none}pre,pre code{white-space:pre-wrap!important;overflow-wrap:anywhere!important;overflow:visible!important}table{display:table!important;width:100%!important;table-layout:fixed}td,th{min-width:0!important;overflow-wrap:anywhere}h1,h2,h3{break-after:avoid}img{break-inside:avoid}}</style></head><body>${html}</body></html>`;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function bundle(source: string, name: string) {
  const zip = new JSZip();
  zip.file(name, source);
  const refs = [
    ...new Set(source.match(/assets\/[\w-]+\.(?:png|jpg|gif|webp)/g) || []),
  ];
  for (const ref of refs) {
    const r = await fetch("/api/" + ref);
    if (!r.ok) throw new Error("找不到图片 " + ref);
    zip.file(ref, await r.blob());
  }
  download(
    await zip.generateAsync({ type: "blob" }),
    name.replace(/\.md$/i, "") + "-含图片.zip",
  );
}
