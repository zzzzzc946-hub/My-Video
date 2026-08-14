import { createServer } from "node:net";

const canListen = (port: number) => new Promise<boolean>((resolve) => {
  const server = createServer();
  server.unref();
  server.once("error", () => resolve(false));
  server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
});

export const findAvailableLoopbackPort = async (
  preferred = 0,
  probe: (port: number) => Promise<boolean> = canListen,
) => {
  if (preferred > 0 && await probe(preferred)) return preferred;
  if (probe !== canListen) {
    for (let port = Math.max(1024, preferred + 1); port <= 65535; port++)
      if (await probe(port)) return port;
    throw new Error("Unable to allocate loopback port");
  }
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return server.close(() => reject(new Error("Unable to allocate loopback port")));
      server.close(() => resolve(address.port));
    });
  });
};

export const runtimeConfigScript = (apiOrigin: string) =>
  `window.__WORKBENCH_API__=${JSON.stringify(apiOrigin)};`;
