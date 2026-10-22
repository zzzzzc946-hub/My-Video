import { expect, it } from "vitest";
import {
  exportActionLabel,
  exportPhaseLabel,
} from "../web/export-interaction.js";

it("expresses the workbench delivery action across idle, running, and complete states", () => {
  expect(exportActionLabel("capcut-package", "idle")).toBe("生成工作台交付包");
  expect(exportActionLabel("capcut-package", "running")).toBe("正在生成…");
  expect(exportActionLabel("capcut-package", "complete")).toBe("已生成");
});

it("shows an observable final-export percentage and stage instead of a background-submission label", () => {
  expect(exportActionLabel("final-video", "running", 42)).toBe("正在导出 42%");
  expect(exportPhaseLabel("encoding")).toBe("正在编码成片");
});
