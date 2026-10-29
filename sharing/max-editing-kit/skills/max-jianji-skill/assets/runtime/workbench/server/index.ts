import { spawn } from "node:child_process";
import { createApiServer } from "./api.js";
import { findAvailableLoopbackPort } from "./runtime.js";

const valueAfter = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async () => {
  const withWeb = process.argv.includes("--with-web");
  const preferredApi = Number(
    valueAfter("--port") ?? process.env.WORKBENCH_PORT ?? 4317,
  );
  const preferredWeb = Number(
    valueAfter("--web-port") ?? process.env.WORKBENCH_WEB_PORT ?? 5173,
  );
  const apiPort = await findAvailableLoopbackPort(preferredApi);
  const webPort = await findAvailableLoopbackPort(
    preferredWeb === apiPort ? preferredWeb + 1 : preferredWeb,
  );
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const configured = (process.env.WORKBENCH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = [...new Set([webOrigin, ...configured])];
  const server = createApiServer(origins);
  let web: ReturnType<typeof spawn> | null = null;
  let shuttingDown = false;
  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (web && !web.killed) web.kill("SIGTERM");
    server.http.close(() => process.exit(exitCode));
  };
  process.once("SIGINT", () => shutdown(130));
  process.once("SIGTERM", () => shutdown(143));
  await new Promise<void>((resolve, reject) => {
    server.http.once("error", reject);
    server.http.listen(apiPort, "127.0.0.1", resolve);
  });
  if (withWeb) {
    web = spawn(
      "npm",
      [
        "run",
        "workbench:web",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      {
        stdio: "inherit",
        env: { ...process.env, WORKBENCH_API_ORIGIN: apiOrigin },
      },
    );
    web.once("exit", (code) => {
      if (code && server.http.listening) shutdown(code);
    });
  }
  console.log(
    `VideoUse Workbench instance=${server.instanceId} api=${apiOrigin} web=${withWeb ? webOrigin : "external"} allowed=${origins.join(",")}`,
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
