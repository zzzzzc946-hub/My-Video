import { expect, it } from "vitest";
import type { AuditEvent } from "../shared/model.js";

it("shows timeline replacement events as a Chinese editing action", async () => {
  Object.assign(globalThis, { window: {} });
  const appModule = (await import("../web/App.js")) as Record<string, unknown>;
  const naturalEvent = appModule.naturalEvent as
    | ((event: AuditEvent) => string)
    | undefined;

  expect(naturalEvent?.({
    id: "event-1",
    timestamp: "2026-08-01T00:00:00.000Z",
    type: "timeline.replace",
    actor: "user",
    summary: "replace timeline",
  })).toBe("已恢复时间线编辑状态");
});
