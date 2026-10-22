export const MIN_ZOOM = 0.125;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 1;
const BASE_PIXELS_PER_SECOND = 24;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const zoomFromSliderPosition = (position: number) => {
  const clamped = clamp(position, 0, 1);
  return MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, clamped);
};

export const zoomToSliderPosition = (zoom: number) =>
  Math.log(clamp(zoom, MIN_ZOOM, MAX_ZOOM) / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM);

export const pixelsPerSecondForZoom = (zoom: number) =>
  BASE_PIXELS_PER_SECOND * clamp(zoom, MIN_ZOOM, MAX_ZOOM);

export const timelineWidthForZoom = (durationSeconds: number, zoom: number) =>
  Math.max(1, Math.max(0, durationSeconds) * pixelsPerSecondForZoom(zoom));
