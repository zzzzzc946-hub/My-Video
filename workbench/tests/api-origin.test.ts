import { describe, expect, it } from "vitest";
import { resolveWorkbenchApiOrigin } from "../web/api-origin.js";

describe("workbench API origin", () => {
  it.each([
    [undefined, "http://127.0.0.1:4317"],
    ["http://127.0.0.1:45123", "http://127.0.0.1:45123"],
    ["http://localhost:45123/", "http://localhost:45123"],
  ])("accepts only local HTTP endpoints: %s", (candidate, expected) => {
    expect(resolveWorkbenchApiOrigin(candidate)).toBe(expected);
  });

  it.each([
    "https://example.com",
    "http://example.com:4317",
    "https://localhost:4317",
    "http://127.0.0.1",
    "http://127.0.0.1:4317/path",
    "http://user:pass@127.0.0.1:4317",
  ])("rejects an endpoint that could receive local project data: %s", (candidate) => {
    expect(() => resolveWorkbenchApiOrigin(candidate)).toThrow(/local|loopback|API/i);
  });
});
