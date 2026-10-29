import { describe, expect, it } from "vitest";
import { outputTimeFromTimelinePointer, snapTime } from "../web/editor.js";

describe("timeline snapping", () => {
  it("snaps to the nearest edit point inside the visual threshold", () => {
    expect(snapTime(4.96, [2, 5, 8], 0.08)).toBe(5);
  });

  it("keeps the exact drag time when no edit point is close enough", () => {
    expect(snapTime(4.9, [2, 5, 8], 0.08)).toBe(4.9);
  });
});

describe("timeline pointer seeking", () => {
  it("maps a timeline click to its output time", () => {
    expect(outputTimeFromTimelinePointer(340, 100, 24, 60)).toBe(10);
  });

  it("keeps dragging within the editable output range", () => {
    expect(outputTimeFromTimelinePointer(20, 100, 24, 60)).toBe(0);
    expect(outputTimeFromTimelinePointer(2000, 100, 24, 60)).toBe(60);
  });
});
