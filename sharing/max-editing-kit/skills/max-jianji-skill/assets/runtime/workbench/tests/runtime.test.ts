import { expect, it } from "vitest";
import { findAvailableLoopbackPort, runtimeConfigScript } from "../server/runtime.js";

it("chooses another loopback port when the preferred port is occupied", async () => {
  const selected = await findAvailableLoopbackPort(45123, async (port) => port === 45124);
  expect(selected).toBe(45124);
});

it("creates a browser runtime handoff without query-string configuration", () => {
  expect(runtimeConfigScript("http://127.0.0.1:45123")).toContain(
    'window.__WORKBENCH_API__="http://127.0.0.1:45123"',
  );
});
