import { describe, expect, it } from "vitest";
import {
  applyTimelineOperation,
  createProject,
  toVideoUseEdl,
  validateVideoUseEdl,
} from "../shared/timeline.js";

const project = createProject({
  name: "fixture",
  rootPath: "/projects/fixture",
  sources: [
    { id: "a", originalPath: "/media/a.mp4", durationSeconds: 20 },
    { id: "b", originalPath: "/media/b.mp4", durationSeconds: 12 },
  ],
  segments: [
    { id: "s1", sourceId: "a", sourceIn: 2, sourceOut: 8 },
    { id: "s2", sourceId: "b", sourceIn: 1, sourceOut: 5 },
  ],
});

describe("single A/V timeline", () => {
  it("recalculates output time after a trim", () => {
    const updated = applyTimelineOperation(project, { type: "trim", segmentId: "s1", sourceIn: 3, sourceOut: 7 });
    expect(updated.timeline.segments.map(({ outputIn, outputOut }) => [outputIn, outputOut])).toEqual([[0, 4], [4, 8]]);
  });

  it("moves deletions to a non-destructive library and restores them", () => {
    const deleted = applyTimelineOperation(project, { type: "delete", segmentId: "s1", reason: "false start" });
    expect(deleted.deletedSegments).toHaveLength(1);
    expect(deleted.timeline.segments[0]?.id).toBe("s2");
    const restored = applyTimelineOperation(deleted, { type: "restore", segmentId: "s1", index: 0 });
    expect(restored.timeline.segments.map((segment) => segment.id)).toEqual(["s1", "s2"]);
  });

  it("splits a segment at an exact source time without changing total duration", () => {
    const updated = applyTimelineOperation(project, { type: "split", segmentId: "s1", sourceTime: 5 });
    expect(updated.timeline.segments.map(({ sourceId, sourceIn, sourceOut }) => ({ sourceId, sourceIn, sourceOut }))).toEqual([
      { sourceId: "a", sourceIn: 2, sourceOut: 5 },
      { sourceId: "a", sourceIn: 5, sourceOut: 8 },
      { sourceId: "b", sourceIn: 1, sourceOut: 5 },
    ]);
    expect(updated.timeline.segments.at(-1)?.outputOut).toBe(10);
  });

  it.each([2, 8, Number.NaN])("rejects a split outside the segment interior: %s", (sourceTime) => {
    expect(() => applyTimelineOperation(project, { type: "split", segmentId: "s1", sourceTime })).toThrow(/split|time/i);
  });

  it("replaces timeline state for undo and validates the restored snapshot", () => {
    const trimmed = applyTimelineOperation(project, { type: "trim", segmentId: "s1", sourceIn: 3, sourceOut: 7 });
    const restored = applyTimelineOperation(trimmed, { type: "replace", segments: project.timeline.segments, deletedSegments: project.deletedSegments });
    expect(restored.timeline).toEqual(project.timeline);
  });

  it("exports and validates source-time EDL ranges", () => {
    const edl = toVideoUseEdl(project);
    expect(edl.ranges).toEqual([
      expect.objectContaining({ source: "a", start: 2, end: 8 }),
      expect.objectContaining({ source: "b", start: 1, end: 5 }),
    ]);
    expect(validateVideoUseEdl(project, edl)).toEqual({ ok: true, errors: [] });
  });

  it.each([
    { sourceIn: Number.NaN, sourceOut: 5 },
    { sourceIn: 1, sourceOut: Number.POSITIVE_INFINITY },
    { sourceIn: -1, sourceOut: 5 },
    { sourceIn: 8, sourceOut: 7 },
    { sourceIn: 1, sourceOut: 21 },
    { sourceIn: "1" as unknown as number, sourceOut: 5 },
  ])("rejects invalid trim timecodes against source metadata: %j", ({ sourceIn, sourceOut }) => {
    expect(() => applyTimelineOperation(project, { type: "trim", segmentId: "s1", sourceIn, sourceOut })).toThrow(/time|duration|finite|source/i);
  });
});
