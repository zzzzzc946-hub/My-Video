import { randomUUID } from "node:crypto";
import type { SourceMedia, TimelineOperation, TimelineSegment, VideoUseEdl, WorkbenchProject } from "./model.js";
import { DEFAULT_LAYOUT, normalizeLayout } from "./layout.js";

type ProjectSeed = { name: string; rootPath: string; sources: Array<Omit<SourceMedia, "linkState"> & { linkState?: SourceMedia["linkState"] }>; segments: Array<Omit<TimelineSegment, "outputIn" | "outputOut">> };

export const recalculateTimeline = (segments: TimelineSegment[]): TimelineSegment[] => {
  let outputCursor = 0;
  return segments.map((segment) => {
    const duration = segment.sourceOut - segment.sourceIn;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid segment duration: ${segment.id}`);
    const next = { ...segment, outputIn: outputCursor, outputOut: outputCursor + duration };
    outputCursor = next.outputOut;
    return next;
  });
};

const finiteNonNegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export const validateProjectTimeline = (project: WorkbenchProject) => {
  normalizeLayout(project.layout);
  const sources = new Map(project.sources.map((source) => [source.id, source]));
  for (const source of project.sources) {
    if (source.durationSeconds !== undefined && (!finiteNonNegative(source.durationSeconds) || source.durationSeconds <= 0)) throw new Error(`Invalid authoritative source duration: ${source.id}`);
  }
  for (const segment of [...project.timeline.segments, ...project.deletedSegments]) {
    const source = sources.get(segment.sourceId);
    if (!source) throw new Error(`Timeline source not found: ${segment.sourceId}`);
    if (!finiteNonNegative(segment.sourceIn) || !finiteNonNegative(segment.sourceOut)) throw new Error(`Timecodes must be finite non-negative numbers: ${segment.id}`);
    if (segment.sourceOut <= segment.sourceIn) throw new Error(`Invalid timecode duration: ${segment.id}`);
    if (source.durationSeconds !== undefined && segment.sourceOut > source.durationSeconds) throw new Error(`Timecode exceeds authoritative source duration: ${segment.id}`);
  }
  return project;
};

export const createProject = (seed: ProjectSeed): WorkbenchProject => validateProjectTimeline({
  schemaVersion: 1,
  projectId: randomUUID(),
  name: seed.name,
  rootPath: seed.rootPath,
  sources: seed.sources.map((source) => ({ ...source, linkState: source.linkState ?? "linked" })),
  timeline: { trackId: "av-main", segments: recalculateTimeline(seed.segments.map((segment) => ({ ...segment, outputIn: 0, outputOut: 0 }))) },
  deletedSegments: [],
  transcripts: [],
  decisions: [],
  assets: [],
  versions: [],
  currentVersionId: null,
  layout: DEFAULT_LAYOUT,
  exportHistory: [],
});

export const applyTimelineOperation = (project: WorkbenchProject, operation: TimelineOperation): WorkbenchProject => {
  validateProjectTimeline(project);
  if (operation.type === "replace") {
    return validateProjectTimeline({ ...project, timeline: { trackId: "av-main", segments: recalculateTimeline(operation.segments.map((segment) => ({ ...segment }))) }, deletedSegments: operation.deletedSegments.map((segment) => ({ ...segment })) });
  }
  const segments = [...project.timeline.segments];
  const currentIndex = segments.findIndex((segment) => segment.id === operation.segmentId);
  if (operation.type === "restore") {
    const deletedIndex = project.deletedSegments.findIndex((segment) => segment.id === operation.segmentId);
    if (deletedIndex < 0) throw new Error(`Deleted segment not found: ${operation.segmentId}`);
    const restored = project.deletedSegments[deletedIndex];
    const at = Math.max(0, Math.min(operation.index ?? restored.originalIndex, segments.length));
    segments.splice(at, 0, { ...restored });
    return validateProjectTimeline({ ...project, timeline: { trackId: "av-main", segments: recalculateTimeline(segments) }, deletedSegments: project.deletedSegments.filter((_, index) => index !== deletedIndex) });
  }
  if (currentIndex < 0) throw new Error(`Timeline segment not found: ${operation.segmentId}`);
  if (operation.type === "trim") {
    const source = sourcesForOperation(project).get(segments[currentIndex]!.sourceId);
    if (!source || source.durationSeconds === undefined || source.linkState !== "linked") throw new Error("Cannot trim an unresolved source before relinking");
    if (typeof operation.sourceIn !== "number" || typeof operation.sourceOut !== "number" || !Number.isFinite(operation.sourceIn) || !Number.isFinite(operation.sourceOut) || operation.sourceIn < 0 || operation.sourceOut <= operation.sourceIn) throw new Error("Trim timecodes must be finite, non-negative, and have positive duration");
    segments[currentIndex] = { ...segments[currentIndex], sourceIn: operation.sourceIn, sourceOut: operation.sourceOut };
    return validateProjectTimeline({ ...project, timeline: { trackId: "av-main", segments: recalculateTimeline(segments) } });
  }
  if (operation.type === "reorder") {
    const [moved] = segments.splice(currentIndex, 1);
    segments.splice(Math.max(0, Math.min(operation.index, segments.length)), 0, moved);
    if (!Number.isInteger(operation.index) || operation.index < 0) throw new Error("Reorder index must be a non-negative integer");
    return validateProjectTimeline({ ...project, timeline: { trackId: "av-main", segments: recalculateTimeline(segments) } });
  }
  if (operation.type === "split") {
    const segment = segments[currentIndex]!;
    if (!Number.isFinite(operation.sourceTime) || operation.sourceTime <= segment.sourceIn || operation.sourceTime >= segment.sourceOut) throw new Error("Split time must be strictly inside the segment");
    const suffix = randomUUID();
    segments.splice(currentIndex, 1,
      { ...segment, id: `${segment.id}-left-${suffix}`, sourceOut: operation.sourceTime },
      { ...segment, id: `${segment.id}-right-${suffix}`, sourceIn: operation.sourceTime },
    );
    return validateProjectTimeline({ ...project, timeline: { trackId: "av-main", segments: recalculateTimeline(segments) } });
  }
  const [deleted] = segments.splice(currentIndex, 1);
  return validateProjectTimeline({
    ...project,
    timeline: { trackId: "av-main", segments: recalculateTimeline(segments) },
    deletedSegments: [...project.deletedSegments, { ...deleted, deletedAt: new Date().toISOString(), originalIndex: currentIndex, deletionReason: operation.reason }],
  });
};

const sourcesForOperation = (project: WorkbenchProject) => new Map(project.sources.map((source) => [source.id, source]));

export const toVideoUseEdl = (project: WorkbenchProject): VideoUseEdl => ({
  version: 1,
  sources: Object.fromEntries(project.sources.map((source) => [source.id, source.originalPath])),
  ranges: project.timeline.segments.map((segment) => ({ source: segment.sourceId, start: segment.sourceIn, end: segment.sourceOut, reason: segment.reason })),
  grade: "none",
  overlays: [],
  total_duration_s: project.timeline.segments.at(-1)?.outputOut ?? 0,
});

export const validateVideoUseEdl = (project: WorkbenchProject, edl: VideoUseEdl): { ok: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (edl.ranges.length !== project.timeline.segments.length) errors.push("range count differs");
  project.timeline.segments.forEach((segment, index) => {
    const range = edl.ranges[index];
    if (!range || range.source !== segment.sourceId || range.start !== segment.sourceIn || range.end !== segment.sourceOut) errors.push(`range mismatch at ${index}`);
  });
  const expectedDuration = project.timeline.segments.reduce((total, segment) => total + segment.sourceOut - segment.sourceIn, 0);
  if (Math.abs(edl.total_duration_s - expectedDuration) > 0.0001) errors.push("duration differs");
  return { ok: errors.length === 0, errors };
};
