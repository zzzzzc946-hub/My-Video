import type { LayoutState } from "./model.js";

export const DEFAULT_LAYOUT: LayoutState = { leftRatio: 0.23, mediaRatio: 0.42, timelineRatio: 0.32 };

export const normalizeLayout = (value: unknown): LayoutState => {
  if (!value || typeof value !== "object") throw new Error("Layout must be an object");
  const candidate = value as Record<string, unknown>;
  const fields = ["leftRatio", "mediaRatio", "timelineRatio"] as const;
  if (fields.some((field) => typeof candidate[field] !== "number" || !Number.isFinite(candidate[field]))) throw new Error("Layout ratios must be finite numbers");
  const layout = candidate as LayoutState;
  if (layout.leftRatio < 0.16 || layout.leftRatio > 0.38 || layout.mediaRatio < 0.2 || layout.mediaRatio > 0.7 || layout.timelineRatio < 0.2 || layout.timelineRatio > 0.58) throw new Error("Layout ratios are outside supported bounds");
  return { leftRatio: layout.leftRatio, mediaRatio: layout.mediaRatio, timelineRatio: layout.timelineRatio };
};
