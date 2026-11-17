import fs from "node:fs/promises";
import { replaceFile } from "./file-io.mjs";
import path from "node:path";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
const digest = (v) => createHash("sha256").update(v).digest("hex");
export async function atomicJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + "." + randomBytes(8).toString("hex");
  try {
    await fs.writeFile(temp, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
    await replaceFile(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
export async function setAccount(dir, username, password) {
  if (
    !username?.trim() ||
    username.length > 100 ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("账号不能为空，密码需为 12 至 256 位");
  const salt = randomBytes(32).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  // Credential version invalidates every old session, even if the server is running.
  await atomicJSON(path.join(dir, "account.json"), {
    username: username.trim(),
    salt,
    hash,
    version: randomBytes(24).toString("hex"),
  });
}
export function createAuth(dir, { secure = false, cookiePath = "/" } = {}) {
  const cookieName = "markdown_session";
  const failures = new Map();
  let queue = Promise.resolve();
  function serialized(job) {
    const result = queue.then(job);
    queue = result.catch(() => {});
    return result;
  }
  const account = () => readJSON(path.join(dir, "account.json"), null);
  const sessionsFile = path.join(dir, "sessions.json");
  function token(req) {
    const value = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  }
  function cookie(res, value, clear = false) {
    res.cookie(cookieName, value, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: cookiePath,
      // Browsers cap persistent cookies at about 400 days. Successful use renews it.
      maxAge: clear ? 0 : 400 * 86400000,
    });
  }
  async function authenticate(req, res) {
    const t = token(req);
    if (!t) return null;
    const a = await account();
    const entries = await readJSON(sessionsFile, {});
    if (!a || entries[digest(t)]?.version !== a.version) return null;
    cookie(res, t);
    return a.username;
  }
  async function login(req, res) {
    const now = Date.now();
    for (const [key, entry] of failures)
      if (entry.until <= now) failures.delete(key);
    const key = req.ip;
    const count = failures.get(key);
    if (count?.attempts >= 8)
      return res.status(429).json({ error: "尝试次数过多，请 15 分钟后再试" });
    failures.set(key, {
      attempts: (count?.attempts || 0) + 1,
      until: count?.until || now + 900000,
    });
    const a = await account();
    if (!a)
      return res
        .status(503)
        .json({ error: "尚未配置账号，请先在服务器上设置账号密码" });
    const { username, password } = req.body || {};
    const validInput =
      typeof username === "string" &&
      typeof password === "string" &&
      password.length <= 256;
    const hash = await scrypt(validInput ? password : "invalid", a.salt, 64);
    if (
      !validInput ||
      username !== a.username ||
      !timingSafeEqual(hash, Buffer.from(a.hash, "hex"))
    ) {
      return res.status(401).json({ error: "账号或密码不正确" });
    }
    failures.delete(key);
    const t = randomBytes(32).toString("hex");
    await serialized(async () => {
      const sessions = await readJSON(sessionsFile, {});
      for (const [id, entry] of Object.entries(sessions))
        if (entry.version !== a.version) delete sessions[id];
      if (Object.keys(sessions).length >= 100)
        delete sessions[Object.keys(sessions)[0]];
      sessions[digest(t)] = { version: a.version, created: now };
      await atomicJSON(sessionsFile, sessions);
    });
    cookie(res, t);
    res.json({ username: a.username });
  }
  async function logout(req, res) {
    const t = token(req);
    if (t)
      await serialized(async () => {
        const sessions = await readJSON(sessionsFile, {});
        delete sessions[digest(t)];
        await atomicJSON(sessionsFile, sessions);
      });
    cookie(res, "", true);
    res.json({ ok: true });
  }
  async function changeAccount(req, res) {
    const now = Date.now();
    const count = failures.get(req.ip);
    if (count && count.until > now && count.attempts >= 8)
      return res.status(429).json({ error: "尝试次数过多，请 15 分钟后再试" });
    failures.set(req.ip, {
      attempts: count?.until > now ? count.attempts + 1 : 1,
      until: count?.until > now ? count.until : now + 900000,
    });
    const a = await account();
    const { currentPassword, username, password } = req.body || {};
    if (
      !a ||
      typeof currentPassword !== "string" ||
      currentPassword.length > 256
    )
      return res.status(400).json({ error: "请输入当前密码" });
    const hash = await scrypt(currentPassword, a.salt, 64);
    if (!timingSafeEqual(hash, Buffer.from(a.hash, "hex")))
      return res.status(401).json({ error: "当前密码不正确" });
    await setAccount(dir, username, password);
    failures.delete(req.ip);
    cookie(res, "", true);
    res.json({ ok: true });
  }
  return { authenticate, login, logout, changeAccount };
}
