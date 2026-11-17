import { lazy, Suspense, useEffect, useState } from "react";
import HomePage, { type EditorAction, type EditorEntry } from "./HomePage";
import { api } from "./api";
import { syncLibrary } from "./customThemes";
const App = lazy(() => import("./App"));
const isEditorLocation = () => !!location.hash && location.hash !== "#home";
export default function AuthGate() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [entry, setEntry] = useState<EditorEntry>({ action: "resume", id: 0 });
  const [user, setUser] = useState("");
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  async function enter(name: string) {
    await syncLibrary();
    setUser(name);
  }
  useEffect(() => {
    // A fresh visit always starts at home, including old editor bookmarks.
    window.history.replaceState(
      window.history.state,
      "",
      location.pathname + location.search + "#home",
    );
    const navigate = () => {
      setEditorOpen(isEditorLocation());
      setAccountOpen(false);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    if (user && editorOpen) setMounted(true);
  }, [user, editorOpen]);
  function openEditor(action: EditorAction) {
    setEntry((previous) => ({ action, id: previous.id + 1 }));
    location.hash = "editor";
    setEditorOpen(true);
  }
  function goHome() {
    location.hash = "home";
    setEditorOpen(false);
    setAccountOpen(false);
  }
  useEffect(() => {
    api<{ username: string }>("/api/auth/session")
      .then((s) => enter(s.username))
      .catch(() => {})
      .finally(() => setChecking(false));
    const expired = () => {
      setUser("");
      setError("登录已失效，请重新登录；当前编辑内容仍保留。");
    };
    window.addEventListener("session-lost", expired);
    return () => window.removeEventListener("session-lost", expired);
  }, []);
  async function logout() {
    if (
      document.querySelector(".save-status.unsaved") &&
      !window.confirm("文章尚未保存，确定退出登录吗？")
    )
      return;
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser("");
    } catch (e) {
      window.alert((e as Error).message);
    }
  }
  return (
    <>
      {!editorOpen && <HomePage onEnter={openEditor} />}
      {mounted && (
        <div hidden={!user || !editorOpen}>
          <Suspense
            fallback={
              <p role="status" className="editor-loading">
                正在打开编辑器…
              </p>
            }
          >
            <App
              authenticated={!!user}
              active={!!user && editorOpen}
              entry={entry}
              onHome={goHome}
              onLogout={() => void logout()}
              onAccount={() => {
                setAccountName(user);
                setError("");
                setAccountOpen(true);
              }}
            />
          </Suspense>
        </div>
      )}
      {user && accountOpen && (
        <div
          className="login-screen account-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="账号设置"
        >
          <form
            className="login-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              if (newPassword !== confirmPassword) {
                setError("两次新密码不一致");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await api("/api/auth/account", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    username: accountName,
                    password: newPassword,
                    currentPassword,
                  }),
                });
                setAccountOpen(false);
                setUser("");
                setUsername(accountName);
                setPassword("");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setError("账号已更新，所有旧登录已失效，请重新登录。");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h1>账号设置</h1>
            <p>修改后，所有设备都需要重新登录。</p>
            <label>
              账号
              <input
                autoComplete="username"
                required
                maxLength={100}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </label>
            <label>
              当前密码
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label>
              新密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={256}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}
            <button disabled={busy} type="submit">
              {busy ? "保存中…" : "保存账号设置"}
            </button>
            <button
              disabled={busy}
              type="button"
              className="account-cancel"
              onClick={() => {
                setAccountOpen(false);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
            >
              取消
            </button>
          </form>
        </div>
      )}
      {!user && editorOpen && (
        <main className="login-screen">
          <form
            className="login-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const result = await api<{ username: string }>(
                  "/api/auth/login",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password }),
                  },
                );
                await enter(result.username);
                setPassword("");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <button type="button" className="login-home" onClick={goHome}>
              ← 返回首页
            </button>
            <span className="login-mark">M</span>
            <h1>Markdown 编辑器</h1>
            <p>登录，继续你的写作。</p>
            {checking ? (
              <p role="status">正在检查登录状态…</p>
            ) : (
              <>
                <label>
                  账号
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    maxLength={100}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                  />
                </label>
                <label>
                  密码
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {error && (
                  <p className="login-error" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={busy}>
                  {busy ? "登录中…" : "登录"}
                </button>
                <small>此设备会保持登录，请仅在自己的设备上使用。</small>
              </>
            )}
          </form>
        </main>
      )}
    </>
  );
}
