import { setAccount } from "./auth.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
const dir = path.resolve(process.env.DATA_DIR || "paper");
const command = process.argv[2];
if (command === "revoke") {
  await fs.rm(path.join(dir, ".private/sessions.json"), { force: true });
  console.log("所有登录已撤销");
} else if (command === "set") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { username, password } = JSON.parse(input);
  await setAccount(path.join(dir, ".private"), username, password);
  console.log("账号已设置，旧登录已失效");
} else if (command === "generate") {
  try {
    await fs.access(path.join(dir, ".private/account.json"));
    throw new Error("已有账号，请使用 set 修改");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const password = randomBytes(24).toString("base64url");
  await setAccount(path.join(dir, ".private"), "admin", password);
  // Only this explicit setup command emits the generated password. Never log it in the service.
  process.stdout.write(JSON.stringify({ username: "admin", password }));
} else
  throw new Error(
    "用法：node server/account.mjs set（标准输入 JSON）| generate | revoke",
  );
