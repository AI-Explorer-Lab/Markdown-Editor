# Official WeChat article checker (test-only snapshot)

- Upstream: https://github.com/wechatjs/verify-article-structure-spec
- Commit: `fa69e37341c86bfec4c8c533845910511e534c0c`
- Entry: `cli/engine/index.ts` (version 0.2.16)
- Bundled browser dependency: `mp-darkmode@1.2.3-alpha.1`
- Bundle SHA-256: `d2fcaeb47ba6f92fac71f6b945de5682cea00abc914e616f5bfbec86c38a15bb`

`checker.js` is the unchanged upstream engine bundled as a browser IIFE by
esbuild (`bundle: true, platform: browser, format: iife, globalName:
OfficialChecker`). The line-counting algorithm has NOT been patched. It runs
all upstream checks, including dark mode, paragraph structure and layout.
This snapshot is only loaded in isolated Playwright test pages, never shipped
in the application. It requires no network access to run.

To reproduce: check out the pinned commit, install the CLI dependencies without
install scripts, and bundle the entry above with the project's esbuild. Keep
upstream source and dependency licenses. Updating the snapshot requires testing
the reported five-paragraph regression again.

A passing result proves compatibility with this public revision. It does not
prove that the WeChat production editor uses the same revision or that every
paste conversion preserves the same markup.
