import { randomUUID } from "node:crypto";
import { appendFile, lstat, open, readFile, readdir, writeFile } from "node:fs/promises";
import type { BackgroundTask } from "../shared/model.js";
import { canonicalProjectRoot, ensureSecureDirectory, safeChildPath } from "./security.js";

type TaskResult = { outputPath?: string; summary?: string } | void;
type TaskProgressUpdate = Pick<
  BackgroundTask,
  "progress" | "phase" | "detail"
>;

export class TaskRegistry {
  readonly tasks = new Map<string, BackgroundTask>();
  private constructor(
    private readonly directory: string,
    private readonly logsDirectory: string,
    private readonly onUpdate: (task: BackgroundTask) => Promise<void> | void,
  ) {}

  static async create(candidateRoot: string, onUpdate: (task: BackgroundTask) => Promise<void> | void = () => undefined) {
    const root = await canonicalProjectRoot(candidateRoot);
    const registry = new TaskRegistry(
      await ensureSecureDirectory(root, "workbench", "tasks"),
      await ensureSecureDirectory(root, "workbench", "tasks", "logs"),
      onUpdate,
    );
    await registry.load();
    return registry;
  }

  private async load() {
    for (const filename of (await readdir(this.directory)).filter((entry) => /^[0-9a-f-]{36}\.json$/i.test(entry))) {
      const path = safeChildPath(this.directory, filename);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) continue;
      try {
        const task = JSON.parse(await readFile(path, "utf8")) as BackgroundTask;
        if (`${task.id}.json` !== filename || !["proxy", "render-preview", "render-rough-cut", "render-final-video"].includes(task.kind)) continue;
        this.tasks.set(task.id, task);
        if (task.status === "queued" || task.status === "running") {
          Object.assign(task, { status: "failed", updatedAt: new Date().toISOString(), error: "Task was interrupted before reaching a terminal state" });
          await this.persist(task);
        }
      } catch { /* A corrupt task record is not a trusted task. */ }
    }
  }

  get(id: string) {
    return /^[0-9a-f-]{36}$/i.test(id) ? this.tasks.get(id) : undefined;
  }

  list() { return [...this.tasks.values()]; }

  async readLogSummary(id: string, maximumBytes = 8_192) {
    const task = this.get(id);
    if (!task) return undefined;
    const path = safeChildPath(this.logsDirectory, `${id}.log`);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error("Task log is not a trusted regular file");
    const length = Math.min(info.size, maximumBytes);
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, info.size - length);
      return { taskId: id, summary: buffer.toString("utf8"), truncated: info.size > maximumBytes };
    } finally { await handle.close(); }
  }

  private async persist(task: BackgroundTask) {
    const target = safeChildPath(this.directory, `${task.id}.json`);
    const part = safeChildPath(this.directory, `${task.id}.json.part`);
    await writeFile(part, `${JSON.stringify(task, null, 2)}\n`, "utf8");
    const { rename } = await import("node:fs/promises");
    if (task.status === "complete" || task.status === "failed") {
      await this.onUpdate(task);
      await rename(part, target);
      return;
    }
    await rename(part, target);
    await this.onUpdate(task);
  }

  async start(
    kind: BackgroundTask["kind"],
    runner: (context: {
      logPath: string;
      log: (line: string) => Promise<void>;
      update: (next: TaskProgressUpdate) => Promise<void>;
    }) => Promise<TaskResult>,
    options: { id?: string; versionId?: string } = {},
  ) {
    const id = options.id ?? randomUUID();
    const now = new Date().toISOString();
    const logPath = safeChildPath(this.logsDirectory, `${id}.log`);
    const task: BackgroundTask = {
      id,
      kind,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      logPath,
      versionId: options.versionId,
      progress: 0,
    };
    this.tasks.set(id, task);
    await writeFile(logPath, "", { flag: "wx" });
    await this.persist(task);
    queueMicrotask(() => {
      void (async () => {
        try {
          Object.assign(task, { status: "running", updatedAt: new Date().toISOString() });
          await this.persist(task);
          const log = async (line: string) => { await appendFile(logPath, `${line}\n`, "utf8"); };
          const update = async (next: TaskProgressUpdate) => {
            const progress =
              next.progress === undefined
                ? task.progress
                : Math.max(0, Math.min(100, Math.round(next.progress)));
            Object.assign(task, {
              ...next,
              ...(progress === undefined ? {} : { progress }),
              updatedAt: new Date().toISOString(),
            });
            await this.persist(task);
          };
          const result = await runner({ logPath, log, update });
          const completed: BackgroundTask = {
            ...task,
            status: "complete",
            progress: 100,
            phase: "verifying",
            updatedAt: new Date().toISOString(),
            ...(result ?? {}),
          };
          await this.persist(completed);
          Object.assign(task, completed);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await appendFile(logPath, `${message}\n`, "utf8").catch(() => undefined);
          const failed: BackgroundTask = {
            ...task,
            status: "failed",
            updatedAt: new Date().toISOString(),
            error: message,
          };
          delete failed.outputPath;
          await this.persist(failed);
          Object.assign(task, failed);
        }
      })();
    });
    return task;
  }
}
