import { createApiServer } from "./api.js";
import { spawn } from "node:child_process";

const port = Number(process.env.WORKBENCH_PORT ?? 4317);
const origins = (process.env.WORKBENCH_ALLOWED_ORIGINS ?? "http://127.0.0.1:5173").split(",").map((value) => value.trim()).filter(Boolean);
const server = createApiServer(origins);
const withWeb = process.argv.includes("--with-web");
const configuredWebPort = process.argv.indexOf("--web-port");
const webPort = configuredWebPort >= 0 ? Number(process.argv[configuredWebPort + 1]) : Number(new URL(origins[0]!).port);
const web = withWeb ? spawn("npm", ["run", "workbench:web", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { stdio: "inherit" }) : null;
let shuttingDown = false;
const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (web && !web.killed) web.kill("SIGTERM");
  server.http.close(() => process.exit(exitCode));
};
process.once("SIGINT", () => shutdown(130));
process.once("SIGTERM", () => shutdown(143));
web?.once("exit", (code) => { if (code && server.http.listening) shutdown(code); });
server.http.listen(port, "127.0.0.1", () => {
  const apiOrigin = `http://127.0.0.1:${port}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  console.log(`VideoUse Workbench API: ${apiOrigin} allowed=${origins.join(",")} web=${withWeb ? webOrigin : "external"}`);
});
