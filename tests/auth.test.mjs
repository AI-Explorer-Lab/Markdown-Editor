import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setAccount } from "../server/auth.mjs";
let dir, child, port;
const password = "test-only-password-long";
async function start() {
  child = spawn(process.execPath, ["server/production.mjs"], {
    env: {
      ...process.env,
      DATA_DIR: path.join(dir, "data"),
      BACKUP_DIR: path.join(dir, "backups"),
      PORT: String(port),
      PUBLIC_URL: "https://editor.example/markdown/",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (b) => {
    output += b;
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      if ((await request("/api/health")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Server did not start: " + output);
}
async function stop() {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
}
async function request(
  url,
  { cookie, body, method = "GET", headers = {} } = {},
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: url,
        method,
        headers: {
          Host: "editor.example",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: res.headers,
            }),
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function login() {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: { username: "writer", password },
  });
  assert.equal(result.status, 200);
  const cookie = result.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/markdown\//);
  return cookie.split(";")[0];
}
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-auth-"));
  await setAccount(path.join(dir, "data/.private"), "writer", password);
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  port = socket.address().port;
  socket.close();
  await once(socket, "close");
  await start();
});
after(async () => {
  await stop();
  await fs.rm(dir, { recursive: true, force: true });
});
test("every data and export endpoint requires login", async () => {
  for (const [url, method] of [
    ["/api/papers", "GET"],
    ["/api/papers", "PUT"],
    ["/api/papers/private.md", "GET"],
    ["/api/images", "POST"],
    ["/api/assets/sample-lake.png", "GET"],
    ["/api/pdf", "POST"],
    ["/api/themes", "GET"],
    ["/api/themes", "PUT"],
    ["/api/backup", "GET"],
  ])
    assert.equal((await request(url, { method })).status, 401, url);
});
test("external links can navigate to the homepage but cannot fetch data or submit requests", async () => {
  const headers = {
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  };
  const home = await request("/", { headers });
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.equal((await request("/api/papers", { headers, cookie: await login() })).status, 403);
  assert.equal((await request("/", { headers, method: "POST" })).status, 403);
  assert.equal((await request("/", { headers: { ...headers, "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" } })).status, 403);
  assert.equal((await request("/", { headers: { ...headers, "sec-fetch-dest": "iframe" } })).status, 403);
});
test("untrusted hosts and cross-site requests are rejected", async () => {
  assert.equal(
    (await request("/api/health", { headers: { Host: "attacker.example" } }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: { username: "writer", password },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/health", {
        headers: { "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    403,
  );
});
test("login persists across service restarts; logout revokes the server session", async () => {
  const cookie = await login();
  assert.equal((await request("/api/auth/session", { cookie })).status, 200);
  await stop();
  await start();
  assert.equal((await request("/api/auth/session", { cookie })).status, 200);
  assert.equal(
    (await request("/api/auth/logout", { cookie, method: "POST" })).status,
    200,
  );
  assert.equal((await request("/api/papers", { cookie })).status, 401);
});
test("another device reads saved articles and themes, stale updates cannot overwrite them", async () => {
  const cookie = await login();
  const second = await login();
  const created = await request("/api/papers", {
    cookie,
    method: "PUT",
    body: { name: "跨设备", content: "hello", baseRevision: null },
  });
  assert.equal(created.status, 200);
  const { revision } = await created.json();
  assert.equal(
    (
      await (
        await request("/api/papers/" + encodeURIComponent("跨设备.md"), {
          cookie: second,
        })
      ).json()
    ).content,
    "hello",
  );
  assert.equal(
    (
      await request("/api/papers", {
        cookie: second,
        method: "PUT",
        body: { name: "跨设备", content: "new", baseRevision: revision },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/papers", {
        cookie,
        method: "PUT",
        body: { name: "跨设备", content: "lost", baseRevision: revision },
      })
    ).status,
    409,
  );
  const library = await (await request("/api/themes", { cookie })).json();
  const themes = [
    {
      id: "one",
      config: { version: 1, base: "forest", name: "我的主题", values: {} },
      fontSize: 16,
      lineHeight: 1.8,
    },
  ];
  assert.equal(
    (
      await request("/api/themes", {
        cookie,
        method: "PUT",
        body: { themes, baseRevision: library.revision },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await request("/api/themes", { cookie: second })).json()).themes,
    themes,
  );
  assert.equal(
    (
      await request("/api/themes", {
        cookie,
        method: "PUT",
        body: { themes: [], baseRevision: library.revision },
      })
    ).status,
    409,
  );
  const backup = await request("/api/backup", { cookie });
  assert.equal(backup.status, 200);
  assert.match(backup.headers.get("content-disposition"), /markdown-backup/);
  assert.ok((await backup.arrayBuffer()).byteLength > 100);
});
test("password changes revoke existing sessions without a restart", async () => {
  const cookie = await login();
  await setAccount(path.join(dir, "data/.private"), "writer", password);
  assert.equal((await request("/api/papers", { cookie })).status, 401);
});
test("account settings require the current password and revoke every device", async () => {
  const cookie = await login();
  const other = await login();
  assert.equal(
    (
      await request("/api/auth/account", {
        cookie,
        method: "POST",
        body: { username: "writer", currentPassword: "wrong", password },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/auth/account", {
        cookie,
        method: "POST",
        body: {
          username: "writer",
          currentPassword: password,
          password: "short",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/auth/account", {
        cookie,
        method: "POST",
        body: { username: "writer", currentPassword: password, password },
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/papers", { cookie })).status, 401);
  assert.equal((await request("/api/papers", { cookie: other })).status, 401);
});
test("failed logins are rate limited", async () => {
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await request("/api/auth/login", {
          method: "POST",
          body: { username: "writer", password: "wrong" },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { username: "writer", password },
      })
    ).status,
    429,
  );
});
