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
  } finally {
    releaseCompletion();
  }
});
