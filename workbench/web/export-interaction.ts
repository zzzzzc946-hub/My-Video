export type ExportActionStatus = "idle" | "running" | "complete" | "failed";

export const exportActionLabel = (
  kind: string,
  status: ExportActionStatus,
  progress?: number,
) => {
  if (kind === "capcut-package") {
    if (status === "running") return "正在生成…";
    if (status === "complete") return "已生成";
    return "生成工作台交付包";
  }
  if (status === "running") return `正在导出 ${Math.max(0, Math.min(100, Math.round(progress ?? 0)))}%`;
  if (status === "complete") return "导出成功";
  return "导出成片";
};

export const exportPhaseLabel = (phase?: "rough-cut" | "encoding" | "verifying") => {
  if (phase === "rough-cut") return "正在生成粗剪片段";
  if (phase === "encoding") return "正在编码成片";
  if (phase === "verifying") return "正在验证导出文件";
  return "正在准备导出";
};
