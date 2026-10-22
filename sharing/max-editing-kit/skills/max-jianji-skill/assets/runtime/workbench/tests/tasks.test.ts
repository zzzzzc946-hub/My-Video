import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { TaskRegistry } from "../server/tasks.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

it("publishes a terminal task record only after completion side effects finish", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-task-finalize-"));
  roots.push(root);
  let releaseCompletion!: () => void;
  const completionGate = new Promise<void>((resolve) => {
    releaseCompletion = resolve;
  });
  let markCompletionStarted!: () => void;
  const completionStarted = new Promise<void>((resolve) => {
    markCompletionStarted = resolve;
  });
  const registry = await TaskRegistry.create(root, async (task) => {
    if (task.status !== "complete") return;
    markCompletionStarted();
    await completionGate;
  });
  const task = await registry.start("proxy", async () => undefined);
  await completionStarted;

  try {
    const persisted = JSON.parse(
      await readFile(join(root, "workbench", "tasks", `${task.id}.json`), "utf8"),
    ) as { status: string };
    expect(persisted.status).toBe("running");
    expect(registry.get(task.id)?.status).toBe("running");
  } finally {
    releaseCompletion();
  }
});

it("persists and publishes bounded render progress while a task is running", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-task-progress-"));
  roots.push(root);
  const updates: Array<{ progress?: number; phase?: string; detail?: string }> = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markProgress!: () => void;
  const progressWritten = new Promise<void>((resolve) => {
    markProgress = resolve;
  });
  const registry = await TaskRegistry.create(root, (task) => {
    updates.push({ ...task });
  });
  const task = await registry.start("render-final-video", async ({ update }) => {
    await update({ progress: 44.8, phase: "encoding", detail: "正在编码 MP4" });
    markProgress();
    await gate;
    return { outputPath: "/tmp/final.mp4" };
  });
  await progressWritten;

  try {
    const persisted = JSON.parse(
      await readFile(join(root, "workbench", "tasks", `${task.id}.json`), "utf8"),
    ) as { status: string; progress?: number; phase?: string; detail?: string };
    expect(persisted).toMatchObject({
      status: "running",
      progress: 45,
      phase: "encoding",
      detail: "正在编码 MP4",
    });
    expect(updates).toContainEqual(expect.objectContaining({ progress: 45, phase: "encoding" }));
  } finally {
    release();
  }
});
