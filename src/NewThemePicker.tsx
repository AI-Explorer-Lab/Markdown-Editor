import { useEffect, useId, useRef } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { customCSS, type Appearance, type SavedTheme } from "./customThemes";
import { themes, themePreset } from "./themes";

function ThemeCard({
  name,
  category,
  appearance,
  selected,
  disabled,
  onSelect,
}: {
  name: string;
  category: string;
  appearance: Appearance;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const scope = "new-theme-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLButtonElement>(null);
  const preset = themePreset(appearance.theme);
  useEffect(() => {
    if (selected)
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-label={name}
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={onSelect}
      className={"new-theme-card" + (selected ? " selected" : "")}
    >
      <style>
        {customCSS(appearance.custom, `[data-style-scope="${scope}"]`)}
      </style>
      <div className="new-theme-thumbnail" aria-hidden="true">
        <div
          className="article"
          data-style-scope={scope}
          data-theme={appearance.theme}
          style={
            {
              "--accent": preset.accent,
              "--soft": preset.soft,
              "--paper": preset.bg,
              fontSize: appearance.fontSize,
              lineHeight: appearance.lineHeight,
            } as React.CSSProperties
          }
        >
          <h2>文字的力量</h2>
          <p>
            记录灵感，认真表达。
            <br />
            让每一种想法清晰呈现。
          </p>
          <blockquote>
            <p>留一点空间给思考。</p>
          </blockquote>
        </div>
      </div>
      <span className="new-theme-card-name">{name}</span>
      <span className="new-theme-category">
        {category}
        {selected && <Check size={13} />}
      </span>
    </button>
  );
}

export function NewThemePicker({
  value,
  onChange,
  current,
  library,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  current: Appearance;
  library: SavedTheme[];
  disabled: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const options = [
    ...themes.map((t) => ({
      id: t.id as string,
      name: t.name,
      category: "内置主题",
      appearance: {
        theme: t.id,
        custom: null,
        fontSize: 16,
        lineHeight: 1.8,
      } as Appearance,
    })),
    {
      id: "blank",
      name: "从零自定义",
      category: "中性起点",
      appearance: {
        theme: "blank",
        custom: null,
        fontSize: 16,
        lineHeight: 1.8,
      } as Appearance,
    },
    ...(current.custom
      ? [
          {
            id: "current",
            name: "当前排版 · " + current.custom.name,
            category: "当前文章",
            appearance: current,
          },
        ]
      : []),
    ...library.map((t) => ({
      id: "saved:" + t.id,
      name: t.config.name,
      category: "我的主题",
      appearance: {
        theme: t.config.base,
        custom: t.config,
        fontSize: t.fontSize,
        lineHeight: t.lineHeight,
      },
    })),
  ];
  return (
    <section className="new-theme-picker" aria-label="文章主题">
      <div className="new-theme-heading">
        <span>文章主题</span>
        <div>
          <button
            type="button"
            aria-label="向左浏览主题"
            onClick={() =>
              strip.current?.scrollBy({ left: -300, behavior: "smooth" })
            }
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="向右浏览主题"
            onClick={() =>
              strip.current?.scrollBy({ left: 300, behavior: "smooth" })
            }
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div
        ref={strip}
        className="new-theme-strip"
        role="radiogroup"
        aria-label="文章主题"
        onKeyDown={(e) => {
          if (
            !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) ||
            disabled
          )
            return;
          e.preventDefault();
          const index = options.findIndex((o) => o.id === value);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? options.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + options.length) %
                  options.length;
          onChange(options[next].id);
          (strip.current?.children[next] as HTMLElement)?.focus();
        }}
      >
        {options.map((o) => (
          <ThemeCard
            key={o.id}
            {...o}
            selected={value === o.id}
            disabled={disabled}
            onSelect={() => onChange(o.id)}
          />
        ))}
      </div>
      <p className="new-theme-selection">
        已选：{options.find((o) => o.id === value)?.name} · 左右滑动查看更多
      </p>
    </section>
  );
}
