import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bold,
  Brush,
  ChevronDown,
  Eye,
  File,
  Folder,
  History,
  Image,
  Italic,
  Link,
  Upload,
  X,
} from "lucide-react";
import "./home.css";

export type EditorAction = "new" | "open" | "resume";
export type EditorEntry = { action: EditorAction; id: number };

export default function HomePage({
  onEnter,
}: {
  onEnter: (action: EditorAction) => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const guide = useRef<HTMLDialogElement>(null);
  const guideTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (guideOpen) guide.current?.showModal();
  }, [guideOpen]);
  const closeGuide = () => {
    setGuideOpen(false);
    requestAnimationFrame(() => guideTrigger.current?.focus());
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <a className="home-brand" href="#home" aria-label="Markdown 编辑器首页">
          <span className="home-mark">M</span>
          <span>Markdown 编辑器</span>
        </a>
        <nav className="home-nav" aria-label="首页导航">
          <button ref={guideTrigger} onClick={() => setGuideOpen(true)}>
            使用指南
          </button>
          <button onClick={() => onEnter("resume")}>
            进入编辑器 <ArrowRight aria-hidden="true" />
          </button>
        </nav>
      </header>

      <main className="home-main">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-intro">
            <p className="home-eyebrow">专注每一次书写</p>
            <h1 id="home-title">
              写作，
              <br />
              从这里开始。
            </h1>
            <div className="home-accent" aria-hidden="true" />
            <p className="home-description">
              一个简洁的 Markdown 编辑器。
              <br />
              边写边预览，轻松完成排版与导出。
            </p>
            <div className="home-actions">
              <button className="home-start" onClick={() => onEnter("new")}>
                开始写作 <ArrowRight aria-hidden="true" />
              </button>
              <button className="home-open" onClick={() => onEnter("open")}>
                <Folder aria-hidden="true" /> 打开文档
              </button>
            </div>
            <button className="home-resume" onClick={() => onEnter("resume")}>
              <History aria-hidden="true" /> 继续上次编辑{" "}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>

          <figure
            className="home-demo"
            aria-label="Markdown 编辑与实时预览示例"
          >
            <figcaption className="home-demo-header">
              <span>
                <File aria-hidden="true" /> 写作示例.md
              </span>
              <span className="home-demo-saved">
                <i /> 已保存
              </span>
            </figcaption>
            <div className="home-demo-toolbar" aria-hidden="true">
              <span>
                H <ChevronDown size={14} />
              </span>
              <Bold />
              <Italic />
              <Link />
              <Image />
            </div>
            <div className="home-demo-panes">
              <div className="home-demo-source">
                <div className="home-demo-label">Markdown</div>
                <div className="home-demo-code">
                  <p className="home-code-heading"># 给想法一个开始</p>
                  <p>记录灵感，也整理思路。</p>
                  <p className="home-code-heading">## 今天想写的事</p>
                  <p>
                    - 记下一个新的想法
                    <br />- 整理一段学习笔记
                    <br />- 写一篇自己的文章
                  </p>
                  <p>&gt; 从第一句话开始。</p>
                </div>
              </div>
              <div className="home-demo-preview">
                <div className="home-demo-label">预览</div>
                <div className="home-demo-article">
                  <h2>给想法一个开始</h2>
                  <p>记录灵感，也整理思路。</p>
                  <h3>今天想写的事</h3>
                  <ul>
                    <li>记下一个新的想法</li>
                    <li>整理一段学习笔记</li>
                    <li>写一篇自己的文章</li>
                  </ul>
                  <blockquote>从第一句话开始。</blockquote>
                </div>
              </div>
            </div>
          </figure>
        </section>

        <section className="home-features" aria-label="编辑器功能">
          <div className="home-feature">
            <Eye aria-hidden="true" />
            <div>
              <h2>实时预览</h2>
              <p>文字与排版，即刻呈现</p>
            </div>
          </div>
          <div className="home-feature">
            <Brush aria-hidden="true" />
            <div>
              <h2>主题排版</h2>
              <p>选一种适合文章的风格</p>
            </div>
          </div>
          <div className="home-feature">
            <Upload aria-hidden="true" />
            <div>
              <h2>轻松导出</h2>
              <p>支持 Markdown、HTML 与 PDF</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <span>Markdown 编辑器</span>
        <span>让书写简单一点。</span>
      </footer>

      {guideOpen && (
        <dialog
          ref={guide}
          className="home-guide"
          aria-labelledby="home-guide-title"
          onClose={closeGuide}
          onClick={(e) => {
            if (e.target === e.currentTarget) guide.current?.close();
          }}
        >
          <div className="home-guide-content">
            <div className="home-guide-heading">
              <h2 id="home-guide-title">使用指南</h2>
              <button
                aria-label="关闭使用指南"
                onClick={() => guide.current?.close()}
              >
                <X />
              </button>
            </div>
            <ol>
              <li>
                <strong>开始一篇文章</strong>
                <p>
                  点击“开始写作”，输入标题并选择排版主题；也可以从“打开文档”选择历史文章或导入
                  Markdown 文件。
                </p>
              </li>
              <li>
                <strong>边写边看</strong>
                <p>
                  在左侧输入
                  Markdown，右侧即时预览。手机上可切换“编辑”和“预览”。
                </p>
              </li>
              <li>
                <strong>保存与排版</strong>
                <p>
                  已命名文章会自动保存，也可以按 Ctrl+S
                  保存。在“主题”中选择或定制文章样式。
                </p>
              </li>
              <li>
                <strong>导出文章</strong>
                <p>可以下载 Markdown、HTML、PDF，或复制公众号、知乎格式。</p>
              </li>
            </ol>
          </div>
        </dialog>
      )}
    </div>
  );
}
