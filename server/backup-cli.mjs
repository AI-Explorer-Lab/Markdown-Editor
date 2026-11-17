import http from "node:http";
const req = http.request(
  {
    socketPath: process.env.BACKUP_SOCKET || "/run/markdown-editor/backup.sock",
    path: "/backup",
    method: "POST",
    timeout: 600000,
  },
  (res) => {
    res.pipe(process.stdout);
    if (res.statusCode !== 200) process.exitCode = 1;
  },
);
req.on("timeout", () => req.destroy(new Error("备份超时")));
req.on("error", (err) => {
  console.error(err.message);
  process.exitCode = 1;
});
req.end();
