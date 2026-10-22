import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readFeedbackSummary, recordFeedback } from "../server/feedback.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

it("writes local readable JSON and Markdown telemetry without transcript bodies or credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-feedback-"));
  roots.push(root);
  await recordFeedback(root, {
    type: "project.opened",
    durationMs: 321,
    edl: "edl.v002.json",
    draftEncountered: true,
    transcriptBinding: "automatic",
    detail: "SECRET transcript body must not persist",
  });
  await recordFeedback(root, { type: "operation.trim" });
  const summary = await readFeedbackSummary(root);
  expect(summary.openCount).toBe(1);
  expect(summary.lastOpenDurationMs).toBe(321);
  expect(summary.operationCounts.trim).toBe(1);
  const json = await readFile(join(root, "workbench", "feedback-summary.json"), "utf8");
  const markdown = await readFile(join(root, "workbench", "feedback-summary.md"), "utf8");
  expect(`${json}\n${markdown}`).not.toContain("SECRET");
  expect(markdown).toContain("edl.v002.json");
});
