export const snapTime = (value: number, candidates: number[], threshold: number) => {
  const nearest = candidates.reduce<{ value: number; distance: number } | null>((best, candidate) => {
    const distance = Math.abs(candidate - value);
    return !best || distance < best.distance ? { value: candidate, distance } : best;
  }, null);
  return nearest && nearest.distance <= threshold ? nearest.value : value;
};

export const outputTimeFromTimelinePointer = (
  clientX: number,
  contentLeft: number,
  pixelsPerSecond: number,
  totalDuration: number,
) => {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) return 0;
  const candidate = (clientX - contentLeft) / pixelsPerSecond;
  return Math.min(Math.max(0, candidate), Math.max(0, totalDuration));
};
