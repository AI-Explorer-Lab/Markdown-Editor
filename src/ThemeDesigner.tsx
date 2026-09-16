import { useEffect, useRef, useState } from "react";
import {
  fields,
  readLibrary,
  validateAppearance,
  validateTheme,
  type Appearance,
  type CustomTheme,
  type SavedTheme,
  type Field,
} from "./customThemes";
import { themePreset } from "./themes";
import { download, prepareArticle, htmlDocument } from "./export";
import { Preview } from "./Preview";
import { sample } from "./sample";

function ValueInput({
  field,
  value,
  onValue,
  placeholder,
}: {
  placeholder?: string;
  field: Field;
  value: string | number | undefined;
  onValue: (value: string | number | undefined) => void;
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(String(value ?? ""));
    setInvalid(false);
  }, [value]);
  function update(text: string) {
    setDraft(text);
    if (text === "") {
      setInvalid(false);
      onValue(undefined);
      return;
    }
    const valid =
      field.kind === "color"
        ? /^#[0-9a-f]{6}$/i.test(text)
        : Number.isFinite(Number(text)) &&
          Number(text) >= field.min! &&
          Number(text) <= field.max!;
    setInvalid(!valid);
    if (valid) onValue(field.kind === "color" ? text : Number(text));
  }
  return (
    <input
      aria-label={field.label}
      aria-invalid={invalid}
      title={
        invalid
          ? "请输入有效色值或范围内数值；当前仍使用上次有效设置"
          : undefined
      }
      type={field.kind === "color" ? "text" : "number"}
      placeholder={placeholder || (field.kind === "color" ? "#RRGGBB" : "默认")}
      min={field.min}
      max={field.max}
      step={field.step}
      value={draft}
      onChange={(e) => update(e.target.value)}
      onBlur={() => {
        if (invalid) {
          setDraft(String(value ?? ""));
          setInvalid(false);
        }
      }}
    />
  );
}

export function ThemeDesigner({
  appearance,
  candidate,
  onSelect,
  onApply,
  onEditingChange,
  onChange,
  article,
  notify,
  children,
}: {
  candidate: Appearance | null;
  onSelect: (appearance: Appearance | null) => void;
  onApply: () => void;
  onEditingChange: (editing: boolean) => void;
  appearance: Appearance;
  onChange: (a: Appearance) => void;
  article: React.RefObject<HTMLElement | null>;
  notify: (s: string) => void;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState("built-in");
  const [library, setLibrary] = useState<SavedTheme[]>([]);
  const [libraryError, setLibraryError] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    onEditingChange(editing);
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);
  const [effectiveColors, setEffectiveColors] = useState<
    Record<string, string>
  >({});
  const [baseline, setBaseline] = useState<Appearance | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<"sample" | "wechat" | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const sampleArticle = useRef<HTMLElement | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      setLibrary(readLibrary());
    } catch {
      setLibraryError(true);
      notify("无法读取主题库，原数据已保留。请先导出浏览器数据备份再处理。");
    }
    const sync = (e: StorageEvent) => {
      if (e.key === "markdown-studio-themes")
        try {
          setLibrary(readLibrary());
          setLibraryError(false);
        } catch {
          setLibraryError(true);
        }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!preview) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [preview]);
  useEffect(() => {
    if (!appearance.custom) setSelected(null);
  }, [appearance.custom]);
  const config: CustomTheme = appearance.custom || {
    version: 1,
    base: appearance.theme,
    name: themePreset(appearance.theme).name + " · 自定",
    values: {},
  };
  useEffect(() => {
    if (!editing || !article.current) return;
    const probe = article.current.cloneNode(false) as HTMLElement;
    probe.removeAttribute("id");
    probe.style.cssText +=
      ";position:fixed;visibility:hidden;pointer-events:none;left:-10000px";
    probe.innerHTML =
      '<h1>标题</h1><h2>标题</h2><h3>标题</h3><h4>标题</h4><h5>标题</h5><h6>标题</h6><blockquote>引用</blockquote><strong>加粗</strong><mark>高亮</mark><a>链接</a><span class="image-caption">图注</span><hr><pre><code>代码</code></pre><p><code>行内代码</code></p><table><thead><tr><th>表头</th></tr></thead><tbody><tr><td>单元格</td></tr></tbody></table>';
    article.current.parentElement!.append(probe);
    const colors: Record<string, string> = {};
    for (const field of fields.filter((f) => f.kind === "color")) {
      const target = field.selector
        ? probe.querySelector(field.selector)
        : probe;
      if (!target) continue;
      let raw = getComputedStyle(target)
        .getPropertyValue(
          field.property === "border-color"
            ? "border-top-color"
            : field.property,
        )
        .trim();
      const swatch = document.createElement("span");
      swatch.style.color = raw;
      probe.append(swatch);
      raw = getComputedStyle(swatch).color;
      const rgb = raw.match(/[\d.]+/g)?.map(Number);
      colors[field.key] =
        rgb && rgb.length >= 3
          ? rgb[3] === 0
            ? "透明"
            : "#" +
              rgb
                .slice(0, 3)
                .map((v) => Math.round(v).toString(16).padStart(2, "0"))
                .join("")
          : raw;
      swatch.remove();
    }
    probe.remove();
    setEffectiveColors(colors);
  }, [editing, appearance, article]);
  function change(values: CustomTheme["values"]) {
    onChange({ ...appearance, custom: { ...config, values } });
  }
  function begin() {
    setBaseline(structuredClone(appearance));
    const chosen = candidate || appearance;
    const custom = chosen.custom || {
      version: 1 as const,
      base: chosen.theme,
      name: themePreset(chosen.theme).name + " · 自定",
      values: {},
    };
    setName(custom.name);
    setEditing(true);
    onChange({ ...chosen, custom: structuredClone(custom) });
  }
  function beginBlank() {
    setBaseline(structuredClone(appearance));
    const custom: CustomTheme = {
      version: 1,
      base: "blank",
      name: "我的自定义",
      values: {},
    };
    setSelected(null);
    setName(custom.name);
    setEditing(true);
    onChange({ theme: "blank", custom, fontSize: 16, lineHeight: 1.8 });
  }
  function persist(transform: (current: SavedTheme[]) => SavedTheme[]) {
    if (libraryError) {
      notify("主题库数据异常，暂时不能覆盖保存。");
      return false;
    }
    try {
      const next = transform(readLibrary());
      if (next.length > 100)
        throw new Error("最多保存 100 个主题，请先导出并整理主题库。");
      localStorage.setItem("markdown-studio-themes", JSON.stringify(next));
      setLibrary(next);
      return true;
    } catch (e) {
      notify("主题库未保存：" + (e as Error).message);
      return false;
    }
  }
  function save(update: boolean) {
    try {
      const next = validateTheme({ ...config, name });
      const id = update && selected ? selected : crypto.randomUUID();
      const entry = {
        id,
        config: next,
        fontSize: appearance.fontSize,
        lineHeight: appearance.lineHeight,
      };
      if (
        persist((items) => {
          if (update && !items.some((t) => t.id === id))
            throw new Error("原主题已删除，请另存为新主题。");
          return update
            ? items.map((t) => (t.id === id ? entry : t))
            : [...items, entry];
        })
      ) {
        setSelected(id);
        onChange({ ...appearance, custom: next });
        setEditing(false);
        setTab("mine");
        notify("已保存到我的主题；旧文章保持原排版。");
      }
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function importTheme(file: File) {
    try {
      if (file.size > 65536) throw new Error("主题文件不能超过 64 KB");
      const raw = JSON.parse(await file.text());
      const a = validateAppearance({
        theme: raw.config?.base,
        custom: raw.config,
        fontSize: raw.fontSize,
        lineHeight: raw.lineHeight,
      });
      if (!a.custom) throw new Error("缺少主题配置");
      const entry = {
        id: crypto.randomUUID(),
        config: a.custom,
        fontSize: a.fontSize,
        lineHeight: a.lineHeight,
      };
      if (persist((items) => [...items, entry])) {
        setTab("mine");
        notify("主题已导入，可在我的主题中应用。");
      }
    } catch (e) {
      notify("导入失败：" + (e as Error).message);
    }
  }
  async function showWechat() {
    const node = preview === "sample" ? sampleArticle.current : article.current;
    if (!node || node.dataset.ready !== "true") {
      notify("文章正在渲染，请稍后重试。");
      return;
    }
    setLoading(true);
    try {
      const result = await prepareArticle(node, "wechat");
      setHtml(htmlDocument(result.html, "公众号复制效果"));
      setPreview("wechat");
      const notes = [
        ...result.adjustments,
        ...result.warnings.map((w) => "图片未能内嵌：" + w),
      ];
      if (notes.length) notify(notes.join("；"));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const ink = String(
      config.values.ink ||
        (appearance.theme === "night" ? "#d9e3e5" : "#343d39"),
    ),
    paper = String(config.values.paper || themePreset(appearance.theme).bg);
  const channel = (s: string) =>
    [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const closeColors =
    channel(ink).reduce(
      (sum, n, i) => sum + Math.abs(n - channel(paper)[i]),
      0,
    ) < 150;
  return (
    <div className="theme-designer">
      {!editing ? (
        <>
          <div className="theme-tabs" role="tablist" aria-label="主题来源">
            <button
              role="tab"
              aria-selected={tab === "built-in"}
              onClick={() => setTab("built-in")}
            >
              内置主题
            </button>
            <button
              role="tab"
              aria-selected={tab === "mine"}
              onClick={() => setTab("mine")}
            >
              我的主题 <small>{library.length}</small>
            </button>
          </div>
          <div className="theme-create-actions">
            {tab === "mine" && (
              <button className="theme-primary" onClick={beginBlank}>
                自定义
              </button>
            )}
            {tab === "built-in" && (
              <button className="theme-secondary" onClick={begin}>
                基于此主题定制
              </button>
            )}
          </div>
          <div className="theme-apply-bar">
            <span>
              {candidate
                ? "已选：" +
                  (candidate.custom?.name || themePreset(candidate.theme).name)
                : "选择主题后应用到文章"}
            </span>
            <button className="primary" disabled={!candidate} onClick={onApply}>
              应用这个风格
            </button>
          </div>
          {tab === "built-in" ? (
            children
          ) : (
            <div className="my-themes">
              {!library.length && (
                <p className="theme-hint">
                  点击“自定义”从零开始，或到“内置主题”选择喜欢的风格进行定制。
                </p>
              )}
              {library.map((t) => (
                <div className="saved-theme" key={t.id}>
                  <button
                    className="saved-theme-apply"
                    aria-pressed={
                      candidate?.custom?.name === t.config.name &&
                      JSON.stringify(candidate.custom) ===
                        JSON.stringify(t.config)
                    }
                    onClick={() => {
                      onSelect({
                        theme: t.config.base,
                        custom: structuredClone(t.config),
                        fontSize: t.fontSize,
                        lineHeight: t.lineHeight,
                      });
                      setSelected(t.id);
                    }}
                  >
                    <i
                      style={{
                        background: String(
                          t.config.values.accent ||
                            themePreset(t.config.base).accent,
                        ),
                      }}
                    />
                    <span>
                      {t.config.name}
                      <small>自定义主题</small>
                    </span>
                  </button>
                  <div className="saved-theme-actions">
                    <button
                      aria-label={"编辑 " + t.config.name}
                      onClick={() => {
                        setBaseline(structuredClone(appearance));
                        onChange({
                          theme: t.config.base,
                          custom: structuredClone(t.config),
                          fontSize: t.fontSize,
                          lineHeight: t.lineHeight,
                        });
                        setSelected(t.id);
                        setName(t.config.name);
                        setEditing(true);
                      }}
                    >
                      编辑 / 重命名
                    </button>
                    <button
                      aria-label={"复制 " + t.config.name}
                      onClick={() => {
                        persist((items) => [
                          ...items,
                          {
                            ...structuredClone(t),
                            id: crypto.randomUUID(),
                            config: {
                              ...structuredClone(t.config),
                              name: t.config.name.slice(0, 35) + " 副本",
                            },
                          },
                        ]);
                      }}
                    >
                      复制
                    </button>
                    <button
                      aria-label={"导出 " + t.config.name}
                      onClick={() =>
                        download(
                          new Blob([JSON.stringify(t, null, 2)], {
                            type: "application/json",
                          }),
                          "theme.json",
                        )
                      }
                    >
                      导出
                    </button>
                    <button
                      aria-label={"删除 " + t.config.name}
                      onClick={() => {
                        if (
                          persist((items) => items.filter((x) => x.id !== t.id))
                        ) {
                          if (selected === t.id) setSelected(null);
                          notify("已删除主题库条目，文章排版不变。");
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="theme-secondary"
                onClick={() => importRef.current?.click()}
              >
                导入主题文件
              </button>
              <p className="theme-hint">
                主题库保存在当前浏览器；导出 JSON
                可备份或迁移。文章样式随文章单独保存。
              </p>
            </div>
          )}
          {appearance.custom && (
            <p className="theme-hint">
              当前：{appearance.custom.name} · 文章独立配置
            </p>
          )}
        </>
      ) : (
        <>
          <div className="designer-heading">
            <strong>定制排版</strong>
            <span>
              {config.base === "blank"
                ? "独立自定义"
                : "基于" + themePreset(appearance.theme).name}
            </span>
          </div>
          <label className="theme-name-input">
            主题名称
            <input
              aria-label="主题名称"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="theme-hint">
            {config.base === "blank"
              ? "从中性排版开始，不继承内置主题的装饰。未设置的项目使用默认排版。"
              : "未设置的项目沿用基础主题；标题颜色可单独覆盖。"}
            修改实时预览，保存文章后会记录本次排版。
          </p>
          {["整体", "标题", "引用", "强调", "图片", "更多"].map((group) => (
            <details
              key={group}
              open={group === "整体"}
              className="theme-group"
            >
              <summary>{group}</summary>
              {group === "整体" && (
                <div className="theme-settings">
                  <label>
                    字号
                    <select
                      aria-label="字号"
                      value={appearance.fontSize}
                      onChange={(e) =>
                        onChange({
                          ...appearance,
                          fontSize: Number(e.target.value),
                        })
                      }
                    >
                      {Array.from(
                        new Set([
                          ...Array.from({ length: 13 }, (_, i) => i + 12),
                          appearance.fontSize,
                        ]),
                      )
                        .sort((a, b) => a - b)
                        .map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    行距
                    <select
                      aria-label="行距"
                      value={appearance.lineHeight}
                      onChange={(e) =>
                        onChange({
                          ...appearance,
                          lineHeight: Number(e.target.value),
                        })
                      }
                    >
                      {Array.from(
                        new Set([
                          1.5,
                          1.6,
                          1.8,
                          2,
                          2.2,
                          2.5,
                          appearance.lineHeight,
                        ]),
                      )
                        .sort((a, b) => a - b)
                        .map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                    </select>
                  </label>
                </div>
              )}

              {fields
                .filter((f) => f.group === group)
                .map((f) => (
                  <label
                    className={
                      "theme-field" + (f.kind === "color" ? " color-field" : "")
                    }
                    key={f.key}
                  >
                    <span>{f.label}</span>
                    {f.kind === "select" ? (
                      <select
                        aria-label={f.label}
                        value={config.values[f.key] ?? ""}
                        onChange={(e) => {
                          const values = { ...config.values };
                          if (e.target.value === "") delete values[f.key];
                          else values[f.key] = e.target.value;
                          change(values);
                        }}
                      >
                        <option value="">
                          {config.base === "blank" ? "默认" : "跟随主题"}
                        </option>
                        {Object.entries(f.options!).map(([v, l]) => (
                          <option value={v} key={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <ValueInput
                        field={f}
                        placeholder={
                          f.kind === "color"
                            ? effectiveColors[f.key]
                            : undefined
                        }
                        value={config.values[f.key]}
                        onValue={(value) => {
                          const values = { ...config.values };
                          if (value === undefined) delete values[f.key];
                          else values[f.key] = value;
                          change(values);
                        }}
                      />
                    )}
                    {f.kind === "color" && (
                      <input
                        aria-label={f.label + "选色"}
                        type="color"
                        title={effectiveColors[f.key] || "读取颜色"}
                        value={String(
                          config.values[f.key] ||
                            (effectiveColors[f.key]?.startsWith("#")
                              ? effectiveColors[f.key]
                              : "#ffffff"),
                        )}
                        onChange={(e) =>
                          change({ ...config.values, [f.key]: e.target.value })
                        }
                      />
                    )}
                    {f.kind === "color" && (
                      <small className="color-origin">
                        {config.values[f.key]
                          ? "已自定"
                          : config.base === "blank"
                            ? "默认"
                            : "跟随主题"}
                        {effectiveColors[f.key] === "透明" ? " · 透明" : ""}
                      </small>
                    )}
                    <button
                      type="button"
                      className="field-reset"
                      aria-label={"重置" + f.label}
                      title={
                        config.base === "blank" ? "恢复默认" : "恢复跟随主题"
                      }
                      onClick={() => {
                        const values = { ...config.values };
                        delete values[f.key];
                        change(values);
                      }}
                    >
                      ↺
                    </button>
                  </label>
                ))}
              <button
                className="reset-group"
                onClick={() => {
                  const values = { ...config.values };
                  fields
                    .filter((f) => f.group === group)
                    .forEach((f) => delete values[f.key]);
                  change(values);
                }}
              >
                重置{group}设置
              </button>
            </details>
          ))}
          {closeColors && (
            <p className="theme-warning">
              正文与背景颜色接近，请检查文字是否清晰。
            </p>
          )}
          <div className="designer-actions">
            <button className="theme-primary" onClick={() => save(false)}>
              保存为新主题
            </button>
            {selected &&
              library.some(
                (t) => t.id === selected && t.config.base === appearance.theme,
              ) && (
                <button className="theme-secondary" onClick={() => save(true)}>
                  更新所选主题
                </button>
              )}
            <button
              className="theme-secondary"
              onClick={() => {
                setEditing(false);
                onChange({
                  ...appearance,
                  custom: { ...config, name: name.trim() || config.name },
                });
              }}
            >
              仅应用于本文
            </button>
            <button
              className="theme-secondary"
              onClick={() => {
                if (baseline) onChange(baseline);
                setEditing(false);
              }}
            >
              取消定制
            </button>
          </div>
        </>
      )}
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        aria-label="导入主题 JSON"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importTheme(f);
          e.target.value = "";
        }}
      />
      <div className="theme-preview-actions">
        <button onClick={() => setPreview("sample")}>查看样式示例</button>
        <button disabled={loading} onClick={() => void showWechat()}>
          {loading ? "生成中…" : "公众号复制效果"}
        </button>
      </div>
      {preview && (
        <div className="modal-shade">
          <section
            className="modal theme-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={preview === "sample" ? "样式示例" : "公众号复制效果"}
          >
            <div className="modal-title">
              <h2>{preview === "sample" ? "样式示例" : "公众号复制效果"}</h2>
              <button
                autoFocus
                aria-label="关闭效果预览"
                onClick={() => setPreview(null)}
              >
                ×
              </button>
            </div>
            <p className="theme-hint">
              {preview === "sample"
                ? "示例使用当前排版，不替换你的文章。"
                : "以下为实际导出转换结果的快照；仍需在公众号编辑器和手机端检查。"}
            </p>
            {preview === "sample" ? (
              <>
                <Preview
                  source={sample}
                  theme={appearance.theme}
                  custom={appearance.custom}
                  fontSize={appearance.fontSize}
                  lineHeight={appearance.lineHeight}
                  articleRef={sampleArticle}
                  onRendered={() => {}}
                />
                <button
                  disabled={loading}
                  className="theme-secondary"
                  onClick={() => void showWechat()}
                >
                  查看示例的复制效果
                </button>
              </>
            ) : (
              <iframe title="公众号导出结果" sandbox="" srcDoc={html} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
