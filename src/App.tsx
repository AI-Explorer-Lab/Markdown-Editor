import { useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import {
  Bold,
  Italic,
  Quote,
  Link,
  ImagePlus,
  Code2,
  List,
  ListOrdered,
  Table2,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  Save,
  Palette,
  Moon,
  Sun,
  Plus,
  X,
  FileText,
  Upload,
  Heading1,
  Heading2,
  Undo2,
  Redo2,
  LoaderCircle,
  ArrowUpRight,
} from "lucide-react";
import { undo, redo } from "@codemirror/commands";
import { Editor } from "./Editor";
import { Preview } from "./Preview";
import { themes, ThemeId, isThemeId } from "./themes";
import { NewThemePicker } from "./NewThemePicker";
import { ThemeDesigner } from "./ThemeDesigner";
import {
  validateAppearance,
  readLibrary,
  type SavedTheme,
  type Appearance,
  type CustomTheme,
} from "./customThemes";
import { sample } from "./sample";
import { download, prepareArticle, htmlDocument, bundle } from "./export";
type Paper = {
  name: string;
  content: string;
  revision: string;
  appearance?: Appearance | null;
};
type Draft = {
  source: string;
  name: string;
  revision: string | null;
  saved: string;
  theme: ThemeId;
  custom: CustomTheme | null;
  savedAppearance: string;
  fontSize: number;
  lineHeight: number;
};
const appearanceOf = (d: Appearance): Appearance => ({
  theme: d.theme,
  custom: d.custom,
  fontSize: d.fontSize,
  lineHeight: d.lineHeight,
});
const appearanceKey = (d: Appearance) => JSON.stringify(appearanceOf(d));
const hasChanges = (d: Draft) =>
  d.source !== d.saved || (!!d.name && appearanceKey(d) !== d.savedAppearance);
const initial = (): Draft => {
  try {
    const d = JSON.parse(
      localStorage.getItem("markdown-studio-draft") || "null",
    );
    if (d && typeof d.source === "string") {
      let appearance: Appearance = {
        theme: "forest",
        custom: null,
        fontSize: 16,
        lineHeight: 1.8,
      };
      try {
        appearance = validateAppearance({
          theme: isThemeId(d.theme) ? d.theme : "forest",
          custom: d.custom || null,
          fontSize: d.fontSize,
          lineHeight: d.lineHeight,
        });
      } catch {
        /* Keep the user's text even when a stored style is invalid. */
      }
      return {
        ...d,
        ...appearance,
        savedAppearance: d.savedAppearance || appearanceKey(appearance),
      };
    }
  } catch {}
  return {
    source: sample,
    name: "",
    revision: null,
    saved: "",
    theme: "forest",
    custom: null,
    savedAppearance: "",
    fontSize: 16,
    lineHeight: 1.8,
  };
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "操作失败");
  return data;
}
export default function App() {
  const [doc, setDoc] = useState(initial);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("markdown-studio-color-mode");
      if (saved) return saved === "dark";
    } catch {}
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        "markdown-studio-color-mode",
        darkMode ? "dark" : "light",
      );
    } catch {}
  }, [darkMode]);
  const [themesOpen, setThemesOpen] = useState(false);
  const [themeCandidate, setThemeCandidate] = useState<Appearance | null>(null);
  useEffect(() => {
    if (!themesOpen) setThemeCandidate(null);
  }, [themesOpen]);
  const [themeEditing, setThemeEditing] = useState(false);
  const themeButton = useRef<HTMLButtonElement | null>(null);
  const themePanel = useRef<HTMLElement | null>(null);
  const [view, setView] = useState("split");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!themesOpen) return;
    const outside = (event: PointerEvent) => {
      if (
        !themePanel.current?.contains(event.target as Node) &&
        !themeButton.current?.contains(event.target as Node) &&
        !(themeEditing && (event.target as Element).closest(".preview-pane"))
      )
        setThemesOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(".theme-preview-modal")
      ) {
        setThemesOpen(false);
        themeButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [themesOpen, themeEditing]);
  const [dialog, setDialog] = useState<
    "save" | "open" | "image" | "new" | null
  >(null);
  const [saveName, setSaveName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTheme, setNewTheme] = useState("forest");
  const [newError, setNewError] = useState("");
  const [newLibrary, setNewLibrary] = useState<SavedTheme[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [files, setFiles] = useState<{ name: string; updated: number }[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const [split, setSplit] = useState(50);
  const [sync, setSync] = useState(true);
  const editor = useRef<EditorView | null>(null);
  const article = useRef<HTMLElement | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const live = useRef(doc);
  live.current = doc;
  const saving = useRef(false);
  const dirty = hasChanges(doc);
  const workspace = useRef<HTMLDivElement>(null);
  const previewPane = useRef<HTMLDivElement>(null);
  async function refreshHistory() {
    try {
      setFiles(await api("/api/papers"));
      setHistoryError("");
    } catch (e) {
      setHistoryError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!historyOpen) return;
    void refreshHistory();
    const refresh = () => {
      void refreshHistory();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [historyOpen]);
  function notify(message: string) {
    setToast(message);
  }
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 9000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem("markdown-studio-draft", JSON.stringify(doc));
      } catch {
        notify("浏览器恢复草稿空间不足，请及时保存文件。");
      }
    }, 500);
    return () => clearTimeout(id);
  }, [doc]);
  useEffect(() => {
    const close = (e: BeforeUnloadEvent) => {
      if (hasChanges(live.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        requestSave();
      }
    };
    const flush = () => {
      try {
        localStorage.setItem(
          "markdown-studio-draft",
          JSON.stringify(live.current),
        );
      } catch {}
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", close);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", close);
      window.removeEventListener("keydown", keys);
    };
  }, []);
  useEffect(() => {
    const source = editor.current?.scrollDOM;
    const preview = previewPane.current;
    if (!source || !preview || !sync || view !== "split") return;

    // Remember the actual (possibly rounded/clamped) position written by us.
    // Ignore only that scroll event, so a user's reverse scroll can take over.
    const expected = new WeakMap<HTMLElement, number>();
    let leader = source;
    const transfer = (from: HTMLElement, to: HTMLElement) => {
      const range = from.scrollHeight - from.clientHeight;
      if (range <= 0 || !from.clientHeight || !to.clientHeight) return;
      const progress = Math.max(0, Math.min(1, from.scrollTop / range));
      const next = progress * Math.max(0, to.scrollHeight - to.clientHeight);
      if (Math.abs(to.scrollTop - next) < 1) return;
      to.scrollTop = next;
      expected.set(to, to.scrollTop);
    };
    const onScroll = (from: HTMLElement, to: HTMLElement) => {
      const target = expected.get(from);
      expected.delete(from);
      if (target !== undefined && Math.abs(from.scrollTop - target) < 1) return;
      leader = from;
      transfer(from, to);
    };
    const fromSource = () => onScroll(source, preview);
    const fromPreview = () => onScroll(preview, source);
    source.addEventListener("scroll", fromSource, { passive: true });
    preview.addEventListener("scroll", fromPreview, { passive: true });
    // Theme changes, resizing, diagrams and image loads change scroll ranges.
    let frame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        transfer(leader, leader === source ? preview : source),
      );
    });
    resize.observe(source);
    resize.observe(editor.current!.contentDOM);
    resize.observe(preview);
    if (article.current) resize.observe(article.current);
    transfer(source, preview);
    return () => {
      source.removeEventListener("scroll", fromSource);
      preview.removeEventListener("scroll", fromPreview);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [sync, view]);
  function setSource(source: string) {
    setDoc((d) => ({ ...d, source }));
  }
  function insert(before: string, after = "", placeholder = "") {
    const v = editor.current;
    if (!v) return;
    const s = v.state.selection.main;
    const text = v.state.sliceDoc(s.from, s.to) || placeholder;
    v.dispatch({
      changes: { from: s.from, to: s.to, insert: before + text + after },
      selection: {
        anchor: s.from + before.length,
        head: s.from + before.length + text.length,
      },
    });
    v.focus();
  }
  function block(prefix: string) {
    const v = editor.current;
    if (!v) return;
    const range = v.state.selection.main;
    const start = v.state.doc.lineAt(range.from).from;
    const end = v.state.doc.lineAt(range.to).to;
    const text = v.state.sliceDoc(start, end);
    v.dispatch({
      changes: {
        from: start,
        to: end,
        insert: text
          .split("\n")
          .map((s) => prefix + s)
          .join("\n"),
      },
    });
    v.focus();
  }
  function requestSave() {
    if (saving.current) return;
    if (!live.current.name) {
      setSaveName("");
      setDialog("save");
    } else void save(live.current.name);
  }
  async function save(name: string) {
    if (saving.current) return;
    saving.current = true;
    setBusy("保存中");
    const snapshot = live.current;
    try {
      const r = await api<{ name: string; revision: string }>("/api/papers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          content: snapshot.source,
          appearance: appearanceOf(snapshot),
          baseRevision: name === snapshot.name ? snapshot.revision : null,
        }),
      });
      const next = {
        ...live.current,
        name: r.name,
        revision: r.revision,
        saved: snapshot.source,
        savedAppearance: appearanceKey(snapshot),
      };
      live.current = next;
      setDoc(next);
      try {
        localStorage.setItem("markdown-studio-draft", JSON.stringify(next));
      } catch {}
      setDialog(null);
      notify("已保存到 paper/" + r.name);
      void refreshHistory();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      saving.current = false;
      setBusy("");
    }
  }
  function safeSwitch() {
    return (
      !dirty || window.confirm("当前内容尚未保存到文件，仍要离开这篇文章吗？")
    );
  }
  async function openPaper(name: string) {
    if (busy || !safeSwitch()) return;
    setBusy("打开文章");
    try {
      const paper = await api<Paper>("/api/papers/" + encodeURIComponent(name));
      let appearance: Appearance = {
        theme: "forest",
        custom: null,
        fontSize: 16,
        lineHeight: 1.8,
      };
      if (paper.appearance) {
        try {
          appearance = validateAppearance(paper.appearance);
        } catch {
          notify("文章样式配置无效，已使用基础排版。原文件未修改。");
        }
      }
      setDoc((d) => ({
        ...d,
        ...appearance,
        savedAppearance: appearanceKey(appearance),
        source: paper.content,
        saved: paper.content,
        name: paper.name,
        revision: paper.revision,
      }));
      setDialog(null);
      if (window.innerWidth <= 850) setHistoryOpen(false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function newPaper() {
    if (busy) return;
    setNewTitle("");
    setNewError("");
    setNewTheme(doc.custom ? "current" : doc.theme);
    try {
      setNewLibrary(readLibrary());
    } catch {
      setNewLibrary([]);
    }
    setThemesOpen(false);
    setDialog("new");
  }
  async function createPaper() {
    if (saving.current || busy) return;
    if (!newTitle.trim()) {
      setNewError("请输入文章标题");
      return;
    }
    if (!safeSwitch()) return;
    let appearance: Appearance;
    const savedTheme = newLibrary.find((t) => "saved:" + t.id === newTheme);
    if (savedTheme)
      appearance = {
        theme: savedTheme.config.base,
        custom: structuredClone(savedTheme.config),
        fontSize: savedTheme.fontSize,
        lineHeight: savedTheme.lineHeight,
      };
    else if (newTheme === "current")
      appearance = structuredClone(appearanceOf(doc));
    else if (newTheme === "blank")
      appearance = {
        theme: "blank",
        custom: { version: 1, base: "blank", name: "我的自定义", values: {} },
        fontSize: 16,
        lineHeight: 1.8,
      };
    else
      appearance = {
        theme: newTheme as ThemeId,
        custom: null,
        fontSize: 16,
        lineHeight: 1.8,
      };
    saving.current = true;
    setBusy("创建文章");
    setNewError("");
    try {
      appearance = validateAppearance(appearance);
      const result = await api<{ name: string; revision: string }>(
        "/api/papers",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newTitle,
            content: "",
            appearance,
            baseRevision: null,
          }),
        },
      );
      const next: Draft = {
        ...appearance,
        source: "",
        saved: "",
        name: result.name,
        revision: result.revision,
        savedAppearance: appearanceKey(appearance),
      };
      live.current = next;
      setDoc(next);
      setDialog(null);
      setHistoryOpen(true);
      void refreshHistory();
      notify("已创建 paper/" + result.name);
      editor.current?.focus();
    } catch (e) {
      setNewError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy("");
    }
  }
  async function importFile(file: File) {
    if (busy || !safeSwitch()) return;
    if (file.size > 2 * 1024 * 1024) {
      notify("Markdown 文件不能超过 2 MB");
      return;
    }
    setDoc((d) => ({ ...d, source: "", name: "", saved: "", revision: null }));
    const source = await file.text();
    setSource(source);
    setDialog(null);
    notify("已导入 " + file.name + "，首次保存时请命名。");
  }
  async function uploadImages(files: File[]) {
    if (busy) return;
    const markdownFile = files.find((f) => /\.md$/i.test(f.name));
    if (markdownFile) {
      await importFile(markdownFile);
      return;
    }
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      notify("请选择图片或 Markdown 文件");
      return;
    }
    if (images.length > 10) {
      notify("每次最多插入 10 张图片");
      return;
    }
    setBusy("上传图片");
    try {
      const parts: string[] = [];
      for (const image of images) {
        const form = new FormData();
        form.append("image", image);
        const r = await api<{ path: string }>("/api/images", {
          method: "POST",
          body: form,
        });
        parts.push(`![${image.name.replace(/[\[\]\\]/g, "")}](${r.path})`);
      }
      insert("\n" + parts.join("\n\n") + "\n");
      setDialog(null);
      notify(`已插入 ${parts.length} 张图片`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function selectTheme(theme: ThemeId) {
    setThemeCandidate({ ...appearanceOf(doc), theme, custom: null });
  }
  async function copy(platform: "wechat" | "zhihu") {
    if (!article.current || !ready || busy) return;
    setBusy("准备复制");
    try {
      const result = prepareArticle(article.current, platform);
      const item = new ClipboardItem({
        "text/html": result.then(
          (r) => new Blob([r.html], { type: "text/html" }),
        ),
        "text/plain": result.then(
          (r) => new Blob([r.text], { type: "text/plain" }),
        ),
      });
      await navigator.clipboard.write([item]);
      const r = await result;
      notify(
        `已复制${platform === "wechat" ? "公众号" : "知乎"}格式。${r.imageCount ? "含图片，请在目标平台粘贴并确认图片已上传。" : "请粘贴到目标平台。"}${r.warnings.length ? "部分外链图片无法内嵌，需手动补传。" : ""}${r.adjustments.join("")}`,
      );
    } catch (e) {
      notify("复制失败：" + (e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function exportFile(format: "md" | "html" | "pdf" | "zip") {
    setMenu(false);
    if (busy) return;
    const name = doc.name || "未命名文章.md";
    if (format === "md") {
      download(
        new Blob([doc.source], { type: "text/markdown;charset=utf-8" }),
        name,
      );
      return;
    }
    setBusy(format === "zip" ? "打包中" : "生成 " + format.toUpperCase());
    try {
      if (format === "zip") {
        await bundle(doc.source, name);
        return;
      }
      if (!article.current) throw new Error("预览未准备好");
      const output = await prepareArticle(article.current, format);
      const html = htmlDocument(output.html, name.replace(/\.md$/i, ""));
      if (format === "html") {
        download(
          new Blob([html], { type: "text/html;charset=utf-8" }),
          name.replace(/\.md$/i, ".html"),
        );
        notify(
          output.warnings.length
            ? "HTML 已下载，部分外链图片仍需联网。"
            : "HTML 已下载，可离线查看。",
        );
      } else {
        const r = await fetch("/api/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html }),
        });
        if (!r.ok) throw new Error((await r.json()).error);
        download(await r.blob(), name.replace(/\.md$/i, ".pdf"));
        notify("PDF 已下载");
      }
    } catch (e) {
      notify("导出失败：" + (e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function dragSplit(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = workspace.current!.getBoundingClientRect();
    const available = rect.width - 5;
    const move = (event: PointerEvent) =>
      setSplit(
        Math.max(
          25,
          Math.min(75, ((event.clientX - rect.left) / available) * 100),
        ),
      );
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  return (
    <div
      className={
        "app-shell" + (themesOpen && themeEditing ? " customizing" : "")
      }
      data-color-mode={darkMode ? "dark" : "light"}
    >
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Markdown 编辑器</span>
        </div>
        <div className="document-info">
          <span className="document-name" title={doc.name || "首次保存时命名"}>
            {doc.name || "未命名文章.md"}
          </span>
          <span className={"save-status " + (dirty ? "unsaved" : "")}>
            <i />
            {dirty ? "未保存" : doc.name ? "已保存" : "新文章"}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="history-trigger"
            aria-label="文章历史"
            title="文章历史"
            aria-expanded={historyOpen}
            aria-controls="article-history"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <FileText size={17} />
          </button>
          <button
            title="新建文章"
            aria-label="新建文章"
            onClick={newPaper}
            disabled={!!busy}
          >
            <Plus size={17} />
          </button>
          <button
            ref={themeButton}
            className="theme-trigger"
            aria-label="主题"
            aria-expanded={themesOpen}
            aria-controls="theme-popover"
            onClick={() => {
              setThemesOpen(!themesOpen);
              setMenu(false);
            }}
          >
            <Palette size={16} />
            <span>主题</span>
            <ChevronDown size={13} />
          </button>
          <button
            className="color-mode-toggle"
            aria-label={darkMode ? "切换到浅色模式" : "切换到黑暗模式"}
            title={darkMode ? "切换到浅色模式" : "切换到黑暗模式"}
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            aria-label="保存"
            title="保存"
            onClick={requestSave}
            disabled={!!busy}
          >
            <Save size={16} />
            <span>保存</span>
            <kbd>⌘S</kbd>
          </button>
          <button
            className="primary"
            onClick={() => copy("wechat")}
            disabled={!!busy || !ready}
          >
            复制到公众号
          </button>
          <button
            className="secondary-copy"
            onClick={() => copy("zhihu")}
            disabled={!!busy || !ready}
          >
            复制到知乎
          </button>
          <div className="export-wrap">
            <button
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
              disabled={!!busy}
            >
              <span className="desktop-export-label">导出</span>
              <span className="compact-more-label">更多</span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <>
                <div className="menu-backdrop" onClick={() => setMenu(false)} />
                <div className="dropdown">
                  <button
                    className="compact-copy"
                    onClick={() => {
                      setMenu(false);
                      void copy("zhihu");
                    }}
                    disabled={!!busy || !ready}
                  >
                    复制到知乎
                  </button>
                  {(["md", "html", "pdf", "zip"] as const).map((f) => (
                    <button key={f} onClick={() => exportFile(f)}>
                      <Download size={15} />
                      {f === "zip"
                        ? "Markdown + 图片 (.zip)"
                        : f.toUpperCase() + " 文件"}
                      <span>.{f}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="formatbar">
        <div className="format-tools">
          <button
            title="一级标题"
            aria-label="一级标题"
            onClick={() => block("# ")}
          >
            <Heading1 size={19} />
          </button>
          <button
            title="二级标题"
            aria-label="二级标题"
            onClick={() => block("## ")}
          >
            <Heading2 size={19} />
          </button>
          <span className="tool-separator" />
          <button
            title="加粗"
            aria-label="加粗"
            onClick={() => insert("**", "**", "重点文字")}
          >
            <Bold size={18} />
          </button>
          <button
            title="斜体"
            aria-label="斜体"
            onClick={() => insert("*", "*", "强调文字")}
          >
            <Italic size={18} />
          </button>
          <button title="引用" aria-label="引用" onClick={() => block("> ")}>
            <Quote size={18} />
          </button>
          <button
            title="链接"
            aria-label="插入链接"
            onClick={() => insert("[", "](https://example.com)", "链接文字")}
          >
            <Link size={17} />
          </button>
          <button
            title="图片 · 粘贴、拖拽或上传"
            aria-label="插入图片"
            onClick={() => setDialog("image")}
          >
            <ImagePlus size={18} />
          </button>
          <button
            title="代码块"
            aria-label="代码块"
            onClick={() => insert("\n```\n", "\n```\n", "代码")}
          >
            <Code2 size={19} />
          </button>
          <span className="tool-separator" />
          <button
            title="无序列表"
            aria-label="无序列表"
            onClick={() => block("- ")}
          >
            <List size={19} />
          </button>
          <button
            title="有序列表"
            aria-label="有序列表"
            onClick={() => block("1. ")}
          >
            <ListOrdered size={19} />
          </button>
          <button
            title="插入表格"
            aria-label="插入表格"
            onClick={() =>
              insert("\n| 标题 | 内容 |\n| --- | --- |\n| 项目 | 说明 |\n")
            }
          >
            <Table2 size={18} />
          </button>
          <span className="tool-separator" />
          <button
            title="撤销"
            aria-label="撤销"
            onClick={() => editor.current && undo(editor.current)}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="重做"
            aria-label="重做"
            onClick={() => editor.current && redo(editor.current)}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <div className="view-tools">
          <div className="segmented">
            {[
              ["split", "双栏"],
              ["edit", "编辑"],
              ["preview", "预览"],
            ].map(([v, label]) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => setView(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="writing-layout">
        {historyOpen && (
          <aside
            id="article-history"
            className="article-history"
            aria-label="文章历史"
          >
            <div className="history-heading">
              <strong>文章历史</strong>
              <button
                aria-label="关闭文章历史"
                onClick={() => setHistoryOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="history-tools">
              <span>paper · {files.length} 篇</span>
              <button onClick={() => void refreshHistory()} disabled={!!busy}>
                刷新
              </button>
            </div>
            <button
              className="theme-secondary"
              onClick={() => importRef.current?.click()}
              disabled={!!busy}
            >
              <FolderOpen size={15} /> 导入本地 Markdown
            </button>
            {historyError && (
              <p role="alert" className="history-error">
                {historyError}
              </p>
            )}
            <nav aria-label="已保存文章">
              {files.map((file) => (
                <button
                  key={file.name}
                  title={file.name}
                  className={doc.name === file.name ? "active" : ""}
                  aria-current={doc.name === file.name ? "page" : undefined}
                  disabled={!!busy}
                  onClick={() => void openPaper(file.name)}
                >
                  <FileText size={15} />
                  <span>{file.name.replace(/\.md$/i, "")}</span>
                </button>
              ))}
            </nav>
            {!files.length && !historyError && (
              <p className="theme-hint">
                还没有文章。点击“新建文章”创建第一篇。
              </p>
            )}
            <button
              className="theme-secondary"
              onClick={newPaper}
              disabled={!!busy}
            >
              新建文章
            </button>
          </aside>
        )}
        <main
          ref={workspace}
          className={`workspace view-${view} no-sidebar`}
          style={{ "--split": split } as React.CSSProperties}
        >
          <section className="editing-pane" aria-label="源码编辑区">
            <Editor
              value={doc.source}
              onChange={setSource}
              viewRef={editor}
              onFiles={uploadImages}
              onSave={requestSave}
            />
          </section>
          <div
            className="resize-handle"
            role="separator"
            aria-label="调整编辑区宽度"
            aria-orientation="vertical"
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            onPointerDown={dragSplit}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setSplit((s) => Math.max(25, s - 2));
              if (e.key === "ArrowRight") setSplit((s) => Math.min(75, s + 2));
            }}
          />
          <section
            className="preview-pane"
            ref={previewPane}
            aria-label="文章预览"
          >
            <Preview
              source={doc.source}
              theme={doc.theme}
              custom={doc.custom}
              fontSize={doc.fontSize}
              lineHeight={doc.lineHeight}
              articleRef={article}
              onRendered={setReady}
            />
            {!doc.source && (
              <div className="empty-preview">
                <FileText size={34} />
                <h2>从一句话开始</h2>
                <p>在左侧写下文字，预览会在这里出现。</p>
              </div>
            )}
          </section>
        </main>
      </div>
      <aside
        ref={themePanel}
        id="theme-popover"
        className="theme-panel theme-popover"
        hidden={!themesOpen}
        aria-label="主题选择与自定义"
      >
        <div className="panel-title">
          <h2>排版主题</h2>
          <button
            className="theme-close"
            aria-label="关闭主题面板"
            onClick={() => {
              setThemesOpen(false);
              themeButton.current?.focus();
            }}
          >
            <X size={17} />
          </button>
        </div>
        <ThemeDesigner
          key={doc.name}
          onEditingChange={setThemeEditing}
          candidate={themeCandidate}
          onSelect={setThemeCandidate}
          onApply={() => {
            if (themeCandidate) setDoc((d) => ({ ...d, ...themeCandidate }));
            setThemeCandidate(null);
            notify("已应用这个风格");
          }}
          appearance={appearanceOf(doc)}
          onChange={(a) => {
            setThemeCandidate(null);
            setDoc((d) => ({ ...d, ...a }));
          }}
          article={article}
          notify={notify}
        >
          <div className="theme-grid">
            {themes.map((t) => (
              <button
                key={t.id}
                className={
                  "theme-card " +
                  ((themeCandidate || doc).theme === t.id &&
                  !(themeCandidate || doc).custom
                    ? "is-selected"
                    : "")
                }
                aria-label={t.name + "主题"}
                aria-pressed={
                  (themeCandidate || doc).theme === t.id &&
                  !(themeCandidate || doc).custom
                }
                onClick={() => selectTheme(t.id)}
                aria-describedby={"theme-tip-" + t.id}
              >
                <div
                  className={"theme-thumb thumb-" + t.id}
                  style={
                    {
                      "--accent": t.accent,
                      "--soft": t.soft,
                      "--paper": t.bg,
                    } as React.CSSProperties
                  }
                >
                  <div className="mini-title">永远相信文字的力量</div>
                  <div className="mini-rule" />
                  <div className="mini-line" />
                  <div className="mini-line short" />
                  <div className="mini-quote">
                    <span />
                  </div>
                  {(themeCandidate || doc).theme === t.id &&
                    !(themeCandidate || doc).custom && (
                      <span className="theme-check">
                        <Check size={13} />
                      </span>
                    )}
                </div>
                <span className="theme-name">{t.name}</span>
                <span
                  className="theme-tooltip"
                  role="tooltip"
                  id={"theme-tip-" + t.id}
                >
                  {t.description}
                </span>
              </button>
            ))}
          </div>
        </ThemeDesigner>
        <button
          className="sample-link"
          onClick={() => {
            if (safeSwitch())
              setDoc((d) => ({
                ...d,
                source: sample,
                name: "",
                saved: "",
                revision: null,
              }));
          }}
        >
          打开格式示例 <ArrowUpRight size={13} />
        </button>
      </aside>
      <footer className="statusbar">
        <span>
          Markdown <i /> UTF-8
        </span>
        <span>{doc.source.replace(/\s/g, "").length.toLocaleString()} 字</span>
        <div>
          <label className="sync-toggle">
            <input
              type="checkbox"
              checked={sync}
              onChange={(e) => setSync(e.target.checked)}
            />
            同步滚动
          </label>
          <span className="live-status">
            <i />
            {ready ? "实时预览" : "渲染中"}
          </span>
        </div>
      </footer>
      {busy && (
        <div className="busy-pill" role="status">
          <LoaderCircle size={15} className="spin" />
          {busy}…
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <input
        ref={uploadRef}
        aria-label="选择本地图片"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          void uploadImages(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <input
        ref={importRef}
        aria-label="导入 Markdown 文件"
        type="file"
        accept=".md,text/markdown"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void importFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {dialog && (
        <div
          className="modal-shade"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setDialog(null);
          }}
        >
          <section
            className={"modal" + (dialog === "new" ? " new-article-modal" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === "new"
                ? "新建文章"
                : dialog === "save"
                  ? "保存文章"
                  : dialog === "open"
                    ? "打开文章"
                    : "插入图片"
            }
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setDialog(null);
            }}
          >
            <div className="modal-title">
              <h2>
                {dialog === "new"
                  ? "新建文章"
                  : dialog === "save"
                    ? "给文章起个名字"
                    : dialog === "open"
                      ? "打开文章"
                      : "插入图片"}
              </h2>
              <button
                aria-label="关闭对话框"
                onClick={() => setDialog(null)}
                disabled={!!busy}
              >
                <X size={19} />
              </button>
            </div>
            {dialog === "new" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void createPaper();
                }}
              >
                <label className="field-label">
                  文章标题
                  <input
                    autoFocus
                    required
                    maxLength={100}
                    aria-label="文章标题"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="请输入文章标题"
                    disabled={!!busy}
                  />
                </label>
                <p className="path-hint">
                  paper/{newTitle.trim().replace(/\.md$/i, "") || "文章标题"}.md
                </p>
                <NewThemePicker
                  value={newTheme}
                  onChange={setNewTheme}
                  current={appearanceOf(doc)}
                  library={newLibrary}
                  disabled={!!busy}
                />
                <p className="theme-hint">
                  确认后立即创建本地文件并保存主题。同名文章不会被覆盖。
                </p>
                {newError && (
                  <p className="history-error" role="alert">
                    {newError}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => setDialog(null)}
                  >
                    取消
                  </button>
                  <button className="primary" disabled={!!busy} type="submit">
                    创建文章
                  </button>
                </div>
              </form>
            )}
            {dialog === "save" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(saveName);
                }}
              >
                <p className="muted">
                  首次保存后，⌘S / Ctrl+S 将更新同一份文件。
                </p>
                <label className="field-label">
                  文件名
                  <input
                    autoFocus
                    required
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="我的第一篇文章"
                    maxLength={100}
                  />
                </label>
                <p className="path-hint">
                  paper/{saveName.replace(/\.md$/i, "") || "文章名"}.md
                </p>
                <div className="modal-actions">
                  <button type="button" onClick={() => setDialog(null)}>
                    取消
                  </button>
                  <button className="primary" disabled={!!busy} type="submit">
                    保存文章
                  </button>
                </div>
              </form>
            )}
            {dialog === "open" && (
              <>
                <p className="muted">项目 paper 文件夹中的文章</p>
                <div className="file-list">
                  {files.length ? (
                    files.map((f) => (
                      <button key={f.name} onClick={() => openPaper(f.name)}>
                        <FileText size={18} />
                        <span>
                          {f.name}
                          <small>
                            {new Date(f.updated).toLocaleString("zh-CN")}
                          </small>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))
                  ) : (
                    <div className="empty-files">还没有保存的文章</div>
                  )}
                </div>
                <button
                  className="import-button"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={16} />
                  导入本地 Markdown
                </button>
              </>
            )}
            {dialog === "image" && (
              <>
                <button
                  className="upload-area"
                  onClick={() => uploadRef.current?.click()}
                  disabled={!!busy}
                >
                  <ImagePlus size={29} />
                  <strong>选择本地图片</strong>
                  <span>也可在编辑区粘贴截图或拖拽图片</span>
                  <small>PNG、JPEG、WebP、GIF · 单张最大 12 MB</small>
                </button>
                <div className="or-line">或使用图片链接</div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      const u = new URL(imageUrl);
                      if (!["http:", "https:"].includes(u.protocol))
                        throw new Error();
                      insert(
                        `![${imageAlt.replace(/[\[\]\\]/g, "")}](${u.href.replace(/\(/g, "%28").replace(/\)/g, "%29")})`,
                      );
                      setDialog(null);
                      setImageUrl("");
                      setImageAlt("");
                    } catch {
                      notify("请输入有效的 http 或 https 图片地址");
                    }
                  }}
                >
                  <input
                    aria-label="图片链接"
                    placeholder="https://example.com/image.png"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    required
                  />
                  <input
                    aria-label="图片说明"
                    placeholder="图片说明（可选）"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                  />
                  <div className="modal-actions">
                    <button className="primary" type="submit">
                      插入图片
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
