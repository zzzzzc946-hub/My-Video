import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { defaultFinalVideoExport } from "../web/export-form.js";

it("starts the export dialog with a standard MP4 delivery based on the project title", () => {
  expect(defaultFinalVideoExport("形象是男生最有价值的投资")).toEqual({
    title: "形象是男生最有价值的投资",
    format: "mp4",
    resolution: "1080p",
    frameRate: "source",
    quality: "standard",
  });
});

it("presents the stable handoff as a workbench delivery package rather than a Jianying import", async () => {
  const app = await readFile(
    join(process.cwd(), "workbench", "web", "App.tsx"),
    "utf8",
  );

  expect(app).toContain("工作台交付包");
  expect(app).not.toContain("jianying-import.fcpxml");
  expect(app).not.toContain("可导入");
  expect(app).not.toContain("剪映工程");
  expect(app).not.toContain("FCPXML");
});

it("renders an in-dialog final-export progress bar without claiming the task was merely submitted", async () => {
  const app = await readFile(
    join(process.cwd(), "workbench", "web", "App.tsx"),
    "utf8",
  );

  expect(app).toContain('className="export-progress"');
  expect(app).not.toContain("已提交后台任务");
});

it("explains the default fast-export compatibility profile in the form", async () => {
  const app = await readFile(
    join(process.cwd(), "workbench", "web", "App.tsx"),
    "utf8",
  );

  expect(app).toContain("默认快速导出");
});
