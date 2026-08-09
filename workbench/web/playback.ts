import type { TimelineSegment } from "../shared/model.js";

type SeekableMedia = Pick<HTMLMediaElement, "paused" | "pause" | "currentTime" | "play">;
type FrameSyncedMedia = Pick<HTMLMediaElement, "paused" | "currentTime"> & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};
type AnimationFrameDriver = {
  request: (callback: (now: number) => void) => number;
  cancel: (handle: number) => void;
};

const browserAnimationFrames = (): AnimationFrameDriver | undefined =>
  typeof requestAnimationFrame === "function"
    ? { request: requestAnimationFrame, cancel: cancelAnimationFrame }
    : undefined;

export const hasHighFrequencyPlaybackSync = (video: FrameSyncedMedia) =>
  typeof video.requestVideoFrameCallback === "function" || Boolean(browserAnimationFrames());

export const startPlaybackHeadSync = (
  video: FrameSyncedMedia,
  onSourceTime: (sourceTime: number) => void,
  animationFrames = browserAnimationFrames(),
) => {
  let active = true;
  let handle: number | undefined;
  const emit = (sourceTime: number) => {
    if (!active || video.paused) return false;
    onSourceTime(sourceTime);
    return true;
  };
  if (typeof video.requestVideoFrameCallback === "function") {
    const schedule = () => {
      handle = video.requestVideoFrameCallback?.((_now, metadata) => {
        if (emit(metadata.mediaTime)) schedule();
      });
    };
    schedule();
    return () => {
      active = false;
      if (handle !== undefined) video.cancelVideoFrameCallback?.(handle);
    };
  }
  if (animationFrames) {
    const schedule = () => {
      handle = animationFrames.request(() => {
        if (emit(video.currentTime)) schedule();
      });
    };
    schedule();
    return () => {
      active = false;
      if (handle !== undefined) animationFrames.cancel(handle);
    };
  }
  return () => { active = false; };
};

export const seekOutputPlayback = (video: SeekableMedia | null, sourceTime: number | null, options: { autoplay?: boolean } = {}) => {
  if (!video || sourceTime === null || !Number.isFinite(sourceTime)) return false;
  if (!video.paused) video.pause();
  video.currentTime = sourceTime;
  if (options.autoplay) void video.play().catch(() => undefined);
  return true;
};

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
