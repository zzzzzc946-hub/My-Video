import { expect, it } from "vitest";
import { DEFAULT_ZOOM, MIN_ZOOM, pixelsPerSecondForZoom, timelineWidthForZoom, zoomFromSliderPosition, zoomToSliderPosition } from "../web/zoom.js";

it("maps the middle of the logarithmic zoom slider to the default review scale", () => {
  expect(zoomFromSliderPosition(0.5)).toBe(DEFAULT_ZOOM);
  expect(zoomToSliderPosition(DEFAULT_ZOOM)).toBe(0.5);
});

it("allows a full-timeline overview without imposing a legacy minimum width", () => {
  expect(MIN_ZOOM).toBeLessThan(DEFAULT_ZOOM);
  expect(pixelsPerSecondForZoom(MIN_ZOOM)).toBeLessThan(4);
  expect(timelineWidthForZoom(300, MIN_ZOOM)).toBeLessThan(980);
});
