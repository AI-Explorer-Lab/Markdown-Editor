import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import tasks from "markdown-it-task-lists";
import hljs from "highlight.js/lib/common";
import katex from "katex";
const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight: (code, lang) =>
    lang && hljs.getLanguage(lang)
      ? hljs.highlight(code, { language: lang }).value
      : md.utils.escapeHtml(code),
})
  .use(anchor, { slugify: (s) => "heading-" + encodeURIComponent(s) })
  .use(footnote)
  .use(tasks, { enabled: false, label: true });
// A conservative dollar-math rule: whitespace and numeric suffixes keep currency literal.
md.inline.ruler.after("escape", "math_inline", (state, silent) => {
  const start = state.pos;
  if (
    state.src[start] !== "$" ||
    state.src[start + 1] === "$" ||
    /\s/.test(state.src[start + 1] || " ")
  )
    return false;
  let end = start + 1;
  while ((end = state.src.indexOf("$", end)) !== -1) {
    if (state.src[end - 1] !== "\\") break;
    end++;
  }
  if (
    end < 0 ||
    /\s/.test(state.src[end - 1]) ||
    /\d/.test(state.src[end + 1] || "") ||
    state.src.slice(start, end).includes("\n")
  )
    return false;
  if (!silent) {
    const t = state.push("math_inline", "", 0);
    t.content = state.src.slice(start + 1, end);
  }
  state.pos = end + 1;
  return true;
});
md.block.ruler.before(
  "fence",
  "math_block",
  (state, start, end, silent) => {
    const pos = state.bMarks[start] + state.tShift[start];
    const first = state.src.slice(pos, state.eMarks[start]).trim();
    if (!first.startsWith("$$")) return false;
    let content = first.slice(2),
      next = start + 1;
    if (content.endsWith("$$")) content = content.slice(0, -2);
    else {
      let found = false;
      for (; next < end; next++) {
        const line = state.src.slice(
          state.bMarks[next] + state.tShift[next],
          state.eMarks[next],
        );
        if (line.trim().endsWith("$$")) {
          content += "\n" + line.slice(0, line.lastIndexOf("$$"));
          next++;
          found = true;
          break;
        }
        content += "\n" + line;
      }
      if (!found) return false;
    }
    if (silent) return true;
    const t = state.push("math_block", "div", 0);
    t.block = true;
    t.content = content;
    t.map = [start, next];
    state.line = next;
    return true;
  },
  { alt: ["paragraph", "reference", "blockquote", "list"] },
);
const math = (text: string, displayMode: boolean) => {
  try {
    return katex.renderToString(text, {
      displayMode,
      throwOnError: true,
      trust: false,
      output: "html",
      strict: "ignore",
    });
  } catch {
    return `<code class="render-error">公式语法有误：${md.utils.escapeHtml(text)}</code>`;
  }
};
md.renderer.rules.math_inline = (tokens, i) =>
  `<span class="math-inline" data-formula="${md.utils.escapeHtml(tokens[i].content)}">${math(tokens[i].content, false)}</span>`;
md.renderer.rules.math_block = (tokens, i) =>
  `<div class="math-block" data-formula="${md.utils.escapeHtml(tokens[i].content)}">${math(tokens[i].content, true)}</div>`;
const fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, i, options, env, self) =>
  tokens[i].info.trim() === "mermaid"
    ? `<div class="diagram" data-diagram="${md.utils.escapeHtml(tokens[i].content)}"><pre>${md.utils.escapeHtml(tokens[i].content)}</pre></div>`
    : fence(tokens, i, options, env, self);
const image = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, i, options, env, self) => {
  const t = tokens[i];
  const source = t.attrGet("src") || "";
  if (source.startsWith("assets/")) t.attrSet("src", "/api/" + source);
  t.attrSet("loading", "lazy");
  const result = image(tokens, i, options, env, self);
  const title = t.attrGet("title");
  return title
    ? `<span class="article-image">${result}<span class="image-caption">${md.utils.escapeHtml(title)}</span></span>`
    : result;
};
export function renderMarkdown(source: string) {
  const env = {};
  const tokens = md.parse(source, env);
  const headings: { id: string; text: string; level: number }[] = [];
  tokens.forEach((t, i) => {
    if (t.type === "heading_open")
      headings.push({
        id: t.attrGet("id") || "",
        text: tokens[i + 1].content,
        level: Number(t.tag.slice(1)),
      });
  });
  // Only replace a stand-alone paragraph, never code or escaped inline content.
  for (let i = 0; i < tokens.length - 2; i++) {
    if (
      tokens[i].type === "paragraph_open" &&
      tokens[i + 1].type === "inline" &&
      tokens[i + 1].content.trim() === "[TOC]"
    ) {
      tokens[i].hidden = true;
      tokens[i + 2].hidden = true;
      tokens[i + 1].type = "html_block";
      tokens[i + 1].content =
        '<nav class="toc" aria-label="文章目录"><strong>目录</strong>' +
        headings
          .map(
            (h) =>
              `<a style="padding-left:${(h.level - 1) * 12}px" href="#${h.id}">${md.utils.escapeHtml(h.text)}</a>`,
          )
          .join("") +
        "</nav>";
      tokens[i + 1].children = null;
    }
  }
  return md.renderer.render(tokens, md.options, env);
}
