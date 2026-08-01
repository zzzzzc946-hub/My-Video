import { expect, it } from "vitest";
import { outputToSourceTime, playbackProgress } from "../web/playback.js";

it("maps shared output time to a source segment time", () => {
  expect(outputToSourceTime([{ id: "a", sourceId: "one", sourceIn: 10, sourceOut: 14, outputIn: 0, outputOut: 4 }, { id: "b", sourceId: "two", sourceIn: 2, sourceOut: 5, outputIn: 4, outputOut: 7 }], 5.5)).toEqual({ segmentId: "b", sourceId: "two", sourceTime: 3.5 });
});

it("uses half-open output ranges and maps an exact cut to the next source", () => {
  const segments = [{ id: "a", sourceId: "one", sourceIn: 10, sourceOut: 14, outputIn: 0, outputOut: 4 }, { id: "b", sourceId: "two", sourceIn: 2, sourceOut: 5, outputIn: 4, outputOut: 7 }];
  expect(outputToSourceTime(segments, 4)).toEqual({ segmentId: "b", sourceId: "two", sourceTime: 2 });
  expect(outputToSourceTime(segments, 7)).toEqual({ segmentId: "b", sourceId: "two", sourceTime: 5 });
});

it("advances to the next output segment when playback reaches sourceOut", () => {
  const segments = [{ id: "a", sourceId: "one", sourceIn: 10, sourceOut: 14, outputIn: 0, outputOut: 4 }, { id: "b", sourceId: "two", sourceIn: 2, sourceOut: 5, outputIn: 4, outputOut: 7 }];
  expect(playbackProgress(segments, "a", 13.5)).toEqual({ outputTime: 3.5, reachedCut: false });
  expect(playbackProgress(segments, "a", 14)).toEqual({ outputTime: 4, reachedCut: true, nextSegmentId: "b" });
});
