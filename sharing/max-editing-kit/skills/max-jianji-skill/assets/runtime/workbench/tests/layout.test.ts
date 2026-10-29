import { expect, it } from "vitest";
import { DEFAULT_LAYOUT, normalizeLayout } from "../shared/layout.js";

it("accepts a finite in-range persisted workbench layout", () => {
  expect(normalizeLayout({ leftRatio: 0.3, mediaRatio: 0.5, timelineRatio: 0.4 })).toEqual({ leftRatio: 0.3, mediaRatio: 0.5, timelineRatio: 0.4 });
});

it("rejects non-finite, string, and out-of-range layout values", () => {
  expect(() => normalizeLayout({ leftRatio: Number.NaN, mediaRatio: 0.5, timelineRatio: 0.4 })).toThrow();
  expect(() => normalizeLayout({ leftRatio: "0.3", mediaRatio: 0.5, timelineRatio: 0.4 })).toThrow();
  expect(() => normalizeLayout({ leftRatio: 0.3, mediaRatio: 0.99, timelineRatio: 0.4 })).toThrow();
});

it("exposes the reset-to-default layout", () => {
  expect(normalizeLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
});
