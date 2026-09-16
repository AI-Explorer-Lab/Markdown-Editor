import { useEffect, useRef, useId } from "react";
import { renderMarkdown } from "./markdown";
import { themePreset, ThemeId } from "./themes";
import { customCSS, type CustomTheme } from "./customThemes";
import DOMPurify from "dompurify";
let serial = Promise.resolve();
let counter = 0;
export function Preview({
  source,
  custom = null,
  theme,
  fontSize,
  lineHeight,
  articleRef,
  onRendered,
}: {
  source: string;
  custom?: CustomTheme | null;
  theme: ThemeId;
  fontSize: number;
  lineHeight: number;
  articleRef: React.RefObject<HTMLElement | null>;
  onRendered: (value: boolean) => void;
}) {
  const generation = useRef(0);
  const scope = "theme-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const t = themePreset(theme);
  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;
    const g = ++generation.current;
    onRendered(false);
    node.dataset.ready = "false";
    node.innerHTML = DOMPurify.sanitize(renderMarkdown(source), {
      ADD_ATTR: ["data-diagram", "data-formula"],
      ADD_TAGS: ["annotation"],
    });
    node.querySelectorAll("img").forEach((img) => {
      img.onerror = () => {
        if (!img.isConnected) return;
        const hint = document.createElement("span");
        hint.className = "broken-image";
        hint.textContent =
          "图片未能加载：" + (img.alt || img.getAttribute("src"));
        img.replaceWith(hint);
      };
    });
    const diagrams = Array.from(node.querySelectorAll<HTMLElement>(".diagram"));
    const work = async () => {
      if (diagrams.length) {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          htmlLabels: false,
          fontFamily: "sans-serif",
          flowchart: { htmlLabels: false },
          suppressErrorRendering: true,
        });
        for (const el of diagrams) {
          if (g !== generation.current) return;
          try {
            const definition = el.dataset.diagram || el.textContent || "";
            el.dataset.diagram = definition;
            const { svg } = await mermaid.render(
              "diagram-" + ++counter,
              definition,
            );
            if (g === generation.current)
              el.innerHTML = DOMPurify.sanitize(svg, {
                USE_PROFILES: { svg: true, svgFilters: true },
              });
          } catch (error) {
            console.error("Mermaid rendering:", error);
            el.innerHTML = '<pre class="render-error"></pre>';
            el.firstChild!.textContent = "图表语法有误，请检查 Mermaid 代码。";
          }
        }
      }
      if (g === generation.current) {
        node.dataset.ready = "true";
        onRendered(true);
      }
    };
    serial = serial.then(work, work).catch(() => {
      if (g === generation.current) {
        node.dataset.ready = "true";
        onRendered(true);
      }
    });
    return () => {
      generation.current++;
    };
  }, [source]);
  return (
    <>
      <style>{customCSS(custom, `[data-style-scope="${scope}"]`)}</style>
      <article
        data-style-scope={scope}
        ref={articleRef}
        className="article"
        data-theme={theme}
        style={
          {
            "--accent": t.accent,
            "--soft": t.soft,
            "--paper": t.bg,
            fontSize,
            lineHeight,
          } as React.CSSProperties
        }
      />
    </>
  );
}
