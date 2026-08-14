const filename = (path: string) => path.split(/[\\/]/).at(-1) ?? path;

export const exportSuccessMessage = (kind: string, path: string) => {
  if (kind === "capcut-package")
    return `已生成工作台交付包 · ${filename(path)}`;
  if (kind === "videouse-edl") return `已生成 VideoUse EDL · ${filename(path)}`;
  return `已生成：${filename(path)}`;
};
