import { access, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { canonicalProjectRoot, ensureSecureDirectory, safeChildPath } from "./security.js";

export type FeedbackInput = {
  type: string;
  durationMs?: number;
  edl?: string;
  draftEncountered?: boolean;
  transcriptBinding?: string;
  status?: string;
  error?: string;
  detail?: string;
};
export type FeedbackSummary = {
  schemaVersion: 1;
  updatedAt: string;
  openCount: number;
  lastOpenDurationMs?: number;
  selectedEdl?: string;
  draftEncountered: boolean;
  transcriptBinding?: string;
  operationCounts: Record<string, number>;
  taskStatusCounts: Record<string, number>;
  exportStatusCounts: Record<string, number>;
  errorCount: number;
};

const empty = (): FeedbackSummary => ({
  schemaVersion: 1,
  updatedAt: new Date(0).toISOString(),
  openCount: 0,
  draftEncountered: false,
  operationCounts: {},
  taskStatusCounts: {},
  exportStatusCounts: {},
  errorCount: 0,
});
const paths = async (root: string) => {
  const canonical = await canonicalProjectRoot(root);
  const workbench = await ensureSecureDirectory(canonical, "workbench");
  return {
    json: safeChildPath(workbench, "feedback-summary.json"),
    markdown: safeChildPath(workbench, "feedback-summary.md"),
    workbench,
  };
};
export const readFeedbackSummary = async (root: string): Promise<FeedbackSummary> => {
  const { json } = await paths(root);
  if (!(await access(json).then(() => true).catch(() => false))) return empty();
  return JSON.parse(await readFile(json, "utf8")) as FeedbackSummary;
};
const increment = (record: Record<string, number>, key: string) => ({ ...record, [key]: (record[key] ?? 0) + 1 });
const renderMarkdown = (summary: FeedbackSummary) => [
  "# VideoUse 工作台反馈摘要",
  "",
  `- 更新时间：${summary.updatedAt}`,
  `- 打开次数：${summary.openCount}`,
  `- 最近打开耗时：${summary.lastOpenDurationMs ?? "未记录"} ms`,
  `- 选定 EDL：${summary.selectedEdl ?? "未记录"}`,
  `- 遇到旧草稿：${summary.draftEncountered ? "是" : "否"}`,
  `- 转写绑定：${summary.transcriptBinding ?? "未记录"}`,
  `- 错误数：${summary.errorCount}`,
  "",
  "## 用户操作",
  ...Object.entries(summary.operationCounts).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## 后台任务",
  ...Object.entries(summary.taskStatusCounts).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## 导出",
  ...Object.entries(summary.exportStatusCounts).map(([key, value]) => `- ${key}: ${value}`),
  "",
].join("\n");
const atomicText = async (directory: string, filename: string, contents: string) => {
  const target = safeChildPath(directory, filename);
  const temporary = safeChildPath(directory, `.${filename}.${randomUUID()}.part`);
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
};
export const recordFeedback = async (root: string, input: FeedbackInput) => {
  const current = await readFeedbackSummary(root);
  const next: FeedbackSummary = { ...current, updatedAt: new Date().toISOString() };
  if (input.type === "project.opened") {
    next.openCount += 1;
    if (Number.isFinite(input.durationMs)) next.lastOpenDurationMs = input.durationMs;
    if (input.edl) next.selectedEdl = input.edl;
    next.draftEncountered ||= input.draftEncountered === true;
    if (input.transcriptBinding) next.transcriptBinding = input.transcriptBinding;
  }
  if (input.type.startsWith("operation.")) next.operationCounts = increment(next.operationCounts, input.type.slice("operation.".length));
  if (input.type.startsWith("task.")) next.taskStatusCounts = increment(next.taskStatusCounts, `${input.type.slice("task.".length)}:${input.status ?? "unknown"}`);
  if (input.type.startsWith("export.")) next.exportStatusCounts = increment(next.exportStatusCounts, `${input.type.slice("export.".length)}:${input.status ?? "unknown"}`);
  if (input.error) next.errorCount += 1;
  const { workbench } = await paths(root);
  await atomicText(workbench, "feedback-summary.json", `${JSON.stringify(next, null, 2)}\n`);
  await atomicText(workbench, "feedback-summary.md", renderMarkdown(next));
  return next;
};
