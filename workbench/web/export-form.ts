import type { FinalVideoExportRequest } from "../shared/model.js";

export const defaultFinalVideoExport = (
  title: string,
): Omit<FinalVideoExportRequest, "destinationDirectory"> => ({
  title,
  format: "mp4",
  resolution: "1080p",
  frameRate: 30,
  quality: "standard",
});
