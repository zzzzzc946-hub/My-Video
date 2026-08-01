export const snapTime = (value: number, candidates: number[], threshold: number) => {
  const nearest = candidates.reduce<{ value: number; distance: number } | null>((best, candidate) => {
    const distance = Math.abs(candidate - value);
    return !best || distance < best.distance ? { value: candidate, distance } : best;
  }, null);
  return nearest && nearest.distance <= threshold ? nearest.value : value;
};
