import { describe, expect, it } from "vitest";
import { snapTime } from "../web/editor.js";

describe("timeline snapping", () => {
  it("snaps to the nearest edit point inside the visual threshold", () => {
    expect(snapTime(4.96, [2, 5, 8], 0.08)).toBe(5);
  });

  it("keeps the exact drag time when no edit point is close enough", () => {
    expect(snapTime(4.9, [2, 5, 8], 0.08)).toBe(4.9);
  });
});
