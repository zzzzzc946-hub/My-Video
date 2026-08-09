import { expect, it } from "vitest";
import { outputToSourceTime, playbackProgress, seekOutputPlayback, startPlaybackHeadSync } from "../web/playback.js";

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

it("pauses active media and seeks it when the editor scrubs the output timeline", () => {
  const video = { paused: false, currentTime: 12, pause: () => { video.paused = true; }, play: () => Promise.resolve() };

  expect(seekOutputPlayback(video, 42.5)).toBe(true);
  expect(video).toMatchObject({ paused: true, currentTime: 42.5 });
});

it("does not seek when the requested source time is unavailable", () => {
  const video = { paused: true, currentTime: 12, pause: () => undefined, play: () => Promise.resolve() };

  expect(seekOutputPlayback(video, null)).toBe(false);
  expect(video.currentTime).toBe(12);
});

it("can resume media immediately after a transcript-driven seek", () => {
  let played = false;
  const video = {
    paused: true,
    currentTime: 12,
    pause: () => undefined,
    play: () => {
      played = true;
      return Promise.resolve();
    },
  };

  expect(seekOutputPlayback(video, 42.5, { autoplay: true })).toBe(true);
  expect(video.currentTime).toBe(42.5);
  expect(played).toBe(true);
});

it("uses decoded video frame timing for smooth playback-head updates", () => {
  let scheduled: ((now: number, metadata: { mediaTime: number }) => void) | undefined;
  let cancelled = -1;
  const seen: number[] = [];
  const video = {
    paused: false,
    currentTime: 5,
    requestVideoFrameCallback: (callback: (now: number, metadata: { mediaTime: number }) => void) => {
      scheduled = callback;
      return 7;
    },
    cancelVideoFrameCallback: (id: number) => { cancelled = id; },
  };

  const stop = startPlaybackHeadSync(video, (sourceTime) => seen.push(sourceTime));
  scheduled?.(0, { mediaTime: 5.25 });

  expect(seen).toEqual([5.25]);
  stop();
  expect(cancelled).toBe(7);
});

it("falls back to animation frames when decoded-frame callbacks are unavailable", () => {
  let scheduled: ((now: number) => void) | undefined;
  let cancelled = -1;
  const seen: number[] = [];
  const video = { paused: false, currentTime: 12 };
  const frames = {
    request: (callback: (now: number) => void) => {
      scheduled = callback;
      return 3;
    },
    cancel: (id: number) => { cancelled = id; },
  };

  const stop = startPlaybackHeadSync(video, (sourceTime) => seen.push(sourceTime), frames);
  video.currentTime = 12.5;
  scheduled?.(16);

  expect(seen).toEqual([12.5]);
  stop();
  expect(cancelled).toBe(3);
});
