import type { TimelineSegment } from "../shared/model.js";

export const outputToSourceTime = (segments: TimelineSegment[], outputTime: number) => {
  const final = segments.at(-1);
  const segment = segments.find((candidate) => outputTime >= candidate.outputIn && outputTime < candidate.outputOut) ?? (final && outputTime === final.outputOut ? final : undefined);
  if (!segment) return null;
  return { segmentId: segment.id, sourceId: segment.sourceId, sourceTime: Math.min(segment.sourceOut, segment.sourceIn + Math.max(0, outputTime - segment.outputIn)) };
};

export const playbackProgress = (segments: TimelineSegment[], segmentId: string, sourceTime: number) => {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index < 0 || !Number.isFinite(sourceTime)) return null;
  const segment = segments[index];
  if (sourceTime >= segment.sourceOut) {
    const next = segments[index + 1];
    return { outputTime: segment.outputOut, reachedCut: true, ...(next ? { nextSegmentId: next.id } : {}) };
  }
  return { outputTime: segment.outputIn + Math.max(0, sourceTime - segment.sourceIn), reachedCut: false };
};
