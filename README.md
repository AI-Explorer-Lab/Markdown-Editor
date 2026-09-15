# Markdown 编辑器

本地运行的 Markdown 写作网页：左侧源码、右侧实时预览，带 10 套正文主题。文章保存在本项目的 `paper/`，图片保存在 `paper/assets/`。

## 启动

需要 Node.js 22 和 npm。首次运行：

```sh
npm install
npm run dev
```

打开 http://localhost:5173 。服务只监听本机回环地址。开发模式修改前端后自动刷新；修改 `server/` 后需重启服务。

生产构建与运行：

```sh
npm run build
npm start
```

PDF 默认使用 macOS 上已安装的 Google Chrome；其他环境先执行 `npx playwright install chromium`。修改端口可用 `PORT=5174 npm run dev`。

## 使用

- 首次点击保存输入文件名，之后点击保存或 `⌘S / Ctrl+S` 覆盖同一文件。已有同名文章请通过“打开”选择；冲突不自动覆盖。
- 编辑内容可从浏览器恢复草稿，但只有文件写入成功才显示“已保存”。打开另一篇或新建会提示尚未保存的更改。
- 图片可粘贴、拖入、上传或插入网络链接。支持 PNG/JPEG/WebP/GIF，每张不超过 12 MB；可一次插入最多 10 张。
- 双栏分隔线可拖动，双栏默认启用双向同步滚动（按滚动进度对应，非逐段精确对齐），底部可关闭。窄屏通过“编辑 / 预览”切换。
- 10 套主题分别改变字体、标题、引用、代码、表格及配色，主题不修改源文。点击卡片即可切换，可调整字号与行距。
- 分别复制公众号和知乎格式。浏览器剪贴板权限必须可用。公式和 Mermaid 图表转换为 PNG；图片是否能被目标平台接收、上传并持久保存，需在目标平台核对。复制成功提示只证明剪贴板写入。
- 可下载 MD、HTML、PDF，或下载 Markdown 与本地图片的 ZIP。单独 MD 不包含图片；ZIP 保留 `assets/` 相对目录。HTML 内嵌可读取的图片，无法跨域读取的外链仍需联网；PDF 如有无法读取的图片会报错，避免静默漏图。

## 支持的语法

CommonMark 基础语法，GFM 表格、删除线、任务列表、自动链接，代码语言高亮，脚注，`[TOC]` 目录，行内 `$...$` 与块级 `$$...$$` 数学，Mermaid 代码围栏。软换行按 Markdown 规则处理：需要显式换行时在行末留两个空格或使用反斜杠。

数学由 KaTeX 支持的语法决定，不是完整 TeX 环境。高亮支持 highlight.js 常见语言集合，未知语言保留纯文本。原始 HTML 以文本显示，不执行标签或脚本。不支持音视频嵌入、MDX、云同步或自动发布。

## 检查

```sh
npm run build
npm run test:server
# 先运行 npm run dev，再运行浏览器测试
npx playwright test
```

浏览器测试默认使用本机 macOS Chrome，配置位于 `playwright.config.ts`。测试在 `paper/` 创建有唯一前缀的临时文章和图片，完成后清理。文件服务测试使用系统临时目录。

## 实现参考与资源

排版方向参考用户指定的 [mdnice](https://editor.mdnice.com/) 主题卡片，由本项目编写主题 CSS，未复制其账号内容。设计方案与图片存放在被忽略的 `plan/`。

示例山湖图片 `public/sample-lake.png` 由内置 image_gen 生成，不代表具体真实地点；启动时复制到 `paper/assets/sample-lake.png`，用于演示本地图片。

技术文档：[markdown-it](https://markdown-it.github.io/markdown-it/)、[Mermaid](https://mermaid.js.org/config/usage.html)、[Playwright PDF](https://playwright.dev/docs/api/class-page#page-pdf)。具体依赖版本锁定在 `package-lock.json`。

`plan/`、`paper/`、依赖、构建和测试输出已列入 `.gitignore`。忽略规则不代替备份，请自行备份 `paper/`。

### 公众号样式兼容

公众号复制会将 `text-align: start/end` 转为明确的左右对齐、为文本写入无单位行高（保留较大行距，最低 1.6 倍，随字号缩放；这是本项目的排版下限，不是官方规定的数值），并移除文字渐变背景。琥珀标题使用金色实线装饰。此转换仅作用于公众号输出；已粘贴到平台的旧内容需要重新复制替换。相关回归检查见 `tests/wechat.spec.ts`，实际平台检测仍需以粘贴后的结果为准。

公众号导出会把混合段落中直接相邻于加粗、行内图片、脚注等元素的裸文本，整理为带相同字号/行距的普通 `span` 文本片段。不会把整段转图、移除加粗/脚注、制造额外空白，或添加跳过检测的属性；本地源码、预览、HTML/PDF 和知乎输出不受这一步影响。

回归测试 `tests/wechat-official.spec.ts` 使用官方校验器的固定快照（来源、版本、许可证见 `tests/vendor/wechat/README.md`），未修改其行数算法。覆盖用户报告的五个混合段落、10 个主题的真实剪贴板输出、`leaf` 包装的添加/移除，以及 320/375/677px 下修改前后的逐字位置对比。官方公开版本通过不等于公众号线上已经验证；线上粘贴可能再次改写 HTML。
