import { isThemeId, type ThemeId } from "./themes";

export type Field = {
  key: string;
  label: string;
  group: string;
  selector: string;
  property: string;
  kind: "color" | "number" | "select";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Record<string, string>;
};
const number = (
  key: string,
  label: string,
  group: string,
  selector: string,
  property: string,
  min: number,
  max: number,
  unit = "px",
  step = 1,
): Field => ({
  key,
  label,
  group,
  selector,
  property,
  kind: "number",
  min,
  max,
  unit,
  step,
});
const color = (
  key: string,
  label: string,
  group: string,
  selector: string,
  property: string,
): Field => ({ key, label, group, selector, property, kind: "color" });
const select = (
  key: string,
  label: string,
  group: string,
  selector: string,
  property: string,
  options: Record<string, string>,
): Field => ({
  key,
  label,
  group,
  selector,
  property,
  kind: "select",
  options,
});
const aligns = {
  left: "左对齐",
  center: "居中",
  right: "右对齐",
  justify: "两端对齐",
};
export const fields: Field[] = [
  color("accent", "主题主色", "整体", "", "--accent"),
  color("ink", "正文颜色", "整体", "", "--ink"),
  color("soft", "辅助背景", "整体", "", "--soft"),
  color("paper", "文章背景", "整体", "", "--paper"),
  select("font", "字体方案", "整体", "", "font-family", {
    "sans-serif": "黑体",
    serif: "宋体",
    monospace: "等宽",
  }),
  number("paragraphGap", "段落间距", "整体", "p", "margin-block", 0, 48),
  number(
    "letterSpacing",
    "字间距",
    "整体",
    "",
    "letter-spacing",
    0,
    4,
    "px",
    0.1,
  ),
  select("align", "正文对齐", "整体", "> p", "text-align", aligns),
  select("indent", "首行缩进", "整体", "> p", "text-indent", {
    "0": "不缩进",
    "2em": "缩进两字",
  }),
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
    number(
      `h${n}Size`,
      `${n} 级标题字号`,
      "标题",
      `h${n}`,
      "font-size",
      12,
      48,
    ),
    color(`h${n}Color`, `${n} 级标题颜色`, "标题", `h${n}`, "color"),
    select(
      `h${n}Align`,
      `${n} 级标题对齐`,
      "标题",
      `h${n}`,
      "text-align",
      aligns,
    ),
    select(`h${n}Weight`, `${n} 级标题粗细`, "标题", `h${n}`, "font-weight", {
      "400": "常规",
      "600": "半粗",
      "700": "粗体",
    }),
    select(
      `h${n}Decoration`,
      `${n} 级标题装饰`,
      "标题",
      `h${n}`,
      "decoration",
      {
        none: "无装饰",
        underline: "底线",
        bar: "左侧竖线",
        fill: "底色块",
        border: "边框",
      },
    ),
    number(
      `h${n}Before`,
      `${n} 级标题上间距`,
      "标题",
      `h${n}`,
      "margin-top",
      0,
      64,
    ),
    number(
      `h${n}After`,
      `${n} 级标题下间距`,
      "标题",
      `h${n}`,
      "margin-bottom",
      0,
      48,
    ),
  ]),
  color("quoteBg", "引用背景", "引用", "blockquote", "background-color"),
  color("quoteInk", "引用文字", "引用", "blockquote", "color"),
  color("quoteBorder", "引用边框颜色", "引用", "blockquote", "border-color"),
  select("quoteStyle", "引用边框样式", "引用", "blockquote", "border-style", {
    none: "无边框",
    solid: "实线",
    dashed: "虚线",
    double: "双线",
  }),
  number(
    "quoteWidth",
    "引用边框粗细",
    "引用",
    "blockquote",
    "border-width",
    0,
    8,
  ),
  number("quotePadding", "引用内边距", "引用", "blockquote", "padding", 0, 32),
  number(
    "quoteRadius",
    "引用圆角",
    "引用",
    "blockquote",
    "border-radius",
    0,
    24,
  ),
  color("strong", "加粗颜色", "强调", "strong", "color"),
  color("mark", "高亮背景", "强调", "mark", "background-color"),
  color("link", "链接颜色", "强调", "a", "color"),
  number("imageRadius", "图片圆角", "图片", "img", "border-radius", 0, 32),
  number(
    "imageGap",
    "图片上下间距",
    "图片",
    ".article-image",
    "margin-block",
    0,
    48,
  ),
  number(
    "captionSize",
    "图注字号",
    "图片",
    ".image-caption",
    "font-size",
    12,
    20,
  ),
  color("captionColor", "图注颜色", "图片", ".image-caption", "color"),
  number("listIndent", "列表缩进", "更多", "ul,ol", "padding-left", 16, 64),
  number("listGap", "条目间距", "更多", "li", "margin-block", 0, 24),
  color("ruleColor", "分隔线颜色", "更多", "hr", "border-top-color"),
  select("ruleStyle", "分隔线样式", "更多", "hr", "border-top-style", {
    solid: "实线",
    dashed: "虚线",
    dotted: "点线",
    double: "双线",
  }),
  color("tableHead", "表头背景", "更多", "th", "background-color"),
  color("tableInk", "表头文字", "更多", "th", "color"),
  color("tableBorder", "表格边框", "更多", "th,td", "border-color"),
  number("cellPadding", "单元格留白", "更多", "th,td", "padding", 2, 24),
  color("codeBg", "代码块背景", "更多", "pre", "background-color"),
  color("codeInk", "代码块文字", "更多", "pre", "color"),
];
export type CustomTheme = {
  version: 1;
  base: ThemeId;
  name: string;
  values: Record<string, string | number>;
};
export type SavedTheme = {
  id: string;
  config: CustomTheme;
  fontSize: number;
  lineHeight: number;
};
export type Appearance = {
  theme: ThemeId;
  custom: CustomTheme | null;
  fontSize: number;
  lineHeight: number;
};
export const validFontSize = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 12 && n <= 24;
export const validLineHeight = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 1.5 && n <= 2.5;
export function validateTheme(raw: unknown): CustomTheme {
  if (!raw || typeof raw !== "object") throw new Error("主题文件格式不正确");
  const r = raw as CustomTheme;
  if (
    r.version !== 1 ||
    !isThemeId(r.base) ||
    typeof r.name !== "string" ||
    !r.name.trim() ||
    r.name.length > 40 ||
    !r.values ||
    typeof r.values !== "object" ||
    Array.isArray(r.values)
  )
    throw new Error("主题版本、名称或基础主题无效");
  const values: CustomTheme["values"] = {};
  for (const [key, value] of Object.entries(r.values)) {
    const f = fields.find((f) => f.key === key);
    if (
      !f ||
      !(f.kind === "color"
        ? typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
        : f.kind === "number"
          ? typeof value === "number" &&
            Number.isFinite(value) &&
            value >= f.min! &&
            value <= f.max!
          : typeof value === "string" && Object.hasOwn(f.options!, value))
    )
      throw new Error("不支持的主题设置：" + key);
    values[key] = value;
  }
  return { version: 1, base: r.base, name: r.name.trim(), values };
}
export function validateAppearance(raw: unknown): Appearance {
  const a = raw as Appearance;
  if (
    !a ||
    !isThemeId(a.theme) ||
    !validFontSize(a.fontSize) ||
    !validLineHeight(a.lineHeight)
  )
    throw new Error("文章排版配置无效");
  const custom = a.custom ? validateTheme(a.custom) : null;
  if (custom && custom.base !== a.theme) throw new Error("基础主题不匹配");
  return {
    theme: a.theme,
    custom,
    fontSize: a.fontSize,
    lineHeight: a.lineHeight,
  };
}
export function customCSS(config: CustomTheme | null, scope: string) {
  if (!config) return "";
  const { values } = validateTheme(config);
  let css = `${scope} > p{line-height:inherit!important;}\n`;
  if (values.accent) {
    css += `${scope} blockquote,${scope} h1,${scope} h2,${scope} h3,${scope} h4,${scope} h5,${scope} h6{border-color:var(--accent)!important;}\n`;
  }
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined) continue;
    const selector = f.selector
      .split(",")
      .map((s) => `${scope} ${s}`.trim())
      .join(",");
    let rule = `${f.property}:${v}${f.kind === "number" ? f.unit : ""} !important;`;
    if (f.property === "decoration")
      rule =
        `border:0!important;background:none!important;box-shadow:none!important;border-radius:0!important;display:block!important;padding:0!important;` +
        ({
          none: "",
          underline:
            "border-bottom:2px solid var(--accent)!important;padding-bottom:.3em!important;",
          bar: "border-left:4px solid var(--accent)!important;padding-left:.65em!important;",
          fill: "background:var(--soft)!important;padding:.35em .65em!important;",
          border:
            "border:1px solid var(--accent)!important;padding:.35em .65em!important;",
        }[v] || "");
    if (f.key === "ink") rule += "color:var(--ink)!important;";
    if (f.key === "font")
      rule =
        "font-family:" +
        ({
          "sans-serif":
            '-apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Microsoft YaHei\", sans-serif',
          serif: '\"Songti SC\", \"SimSun\", serif',
          monospace: '\"SFMono-Regular\", Consolas, monospace',
        }[v] || "sans-serif") +
        "!important;";
    if (f.key === "quoteBg") rule += "background-image:none!important;";
    css += `${selector}{${rule}}\n`;
  }
  // Local color choices win; unmodified headings and emphasis track the accent.
  for (const n of [1, 2, 3, 4, 5, 6])
    if (values[`h${n}Color`] !== undefined)
      css += `${scope} h${n}{color:${values[`h${n}Color`]}!important}`;
  if (values.font) css += `${scope} h1{font-family:inherit!important}`;
  return css;
}
export function readLibrary(): SavedTheme[] {
  const raw = JSON.parse(
    localStorage.getItem("markdown-studio-themes") || "[]",
  );
  if (!Array.isArray(raw) || raw.length > 100)
    throw new Error("主题库格式无效");
  return raw.map((r) => {
    const a = validateAppearance({
      theme: r.config?.base,
      custom: r.config,
      fontSize: r.fontSize,
      lineHeight: r.lineHeight,
    });
    if (typeof r.id !== "string" || !a.custom)
      throw new Error("主题库条目无效");
    return {
      id: r.id,
      config: a.custom,
      fontSize: a.fontSize,
      lineHeight: a.lineHeight,
    };
  });
}
export function isDark(color: string) {
  const match = color.match(/[\d.]+/g);
  if (!match || match.length < 3) return false;
  return +match[0] * 0.2126 + +match[1] * 0.7152 + +match[2] * 0.0722 < 100;
}
