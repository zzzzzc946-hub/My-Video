export type SourceMedia = {
  id: string;
  originalPath: string;
  proxyPath?: string;
  durationSeconds?: number;
  fingerprint?: string;
  linkState: "linked" | "missing" | "changed" | "relink-required";
  authorization?: "project" | "explicit";
};

export type SourceAuthorization = {
  id: string;
  path: string;
  fingerprint: string;
  durationSeconds: number;
  authorizedAt: string;
};

export type TimelineSegment = {
  id: string;
  sourceId: string;
  sourceIn: number;
  sourceOut: number;
  outputIn: number;
  outputOut: number;
  label?: string;
  reason?: string;
};

export type DeletedSegment = TimelineSegment & { deletedAt: string; originalIndex: number; deletionReason?: string };

export type FileReference = { path: string; label?: string };
export type TranscriptReference = FileReference & { sourceId?: string };
export type ExternalAsset = { id: string; type: "caption" | "broll" | "sticker" | "overlay" | "audio"; path: string; sourceTool: string; start?: number; end?: number };
export type VersionRecord = { id: string; name: string; parentVersionId: string | null; createdAt: string; summary: string; durationSeconds: number };
export type LayoutState = { leftRatio: number; mediaRatio: number; timelineRatio: number };
export type ExportRecord = { id: string; kind: "project" | "videouse-edl" | "render-job" | "capcut-package"; createdAt: string; path: string; status: "ready" | "queued" | "failed"; versionId: string };
export type AuditEvent = { id: string; timestamp: string; type: string; actor: "user" | "codex" | "system"; summary: string; payload?: Record<string, unknown> };
export type BackgroundTask = {
  id: string;
  kind: "proxy" | "render-preview" | "render-rough-cut";
  status: "queued" | "running" | "complete" | "failed";
  createdAt: string;
  updatedAt: string;
  logPath: string;
  outputPath?: string;
  summary?: string;
  error?: string;
  versionId?: string;
};

export type WorkbenchProject = {
  schemaVersion: 1;
  projectId: string;
  name: string;
  rootPath: string;
  sources: SourceMedia[];
  timeline: { trackId: "av-main"; segments: TimelineSegment[] };
  deletedSegments: DeletedSegment[];
  transcripts: TranscriptReference[];
  decisions: FileReference[];
  assets: ExternalAsset[];
  versions: VersionRecord[];
  currentVersionId: string | null;
  layout: LayoutState;
  exportHistory: ExportRecord[];
};

export type TimelineOperation =
  | { type: "trim"; segmentId: string; sourceIn: number; sourceOut: number }
  | { type: "delete"; segmentId: string; reason?: string }
  | { type: "restore"; segmentId: string; index?: number }
  | { type: "reorder"; segmentId: string; index: number }
  | { type: "split"; segmentId: string; sourceTime: number }
  | { type: "replace"; segments: TimelineSegment[]; deletedSegments: DeletedSegment[] };

export type VideoUseEdl = {
  version: 1;
  sources: Record<string, string>;
  ranges: Array<{ source: string; start: number; end: number; reason?: string }>;
  grade: "none";
  overlays: [];
  subtitles?: string;
  total_duration_s: number;
};
