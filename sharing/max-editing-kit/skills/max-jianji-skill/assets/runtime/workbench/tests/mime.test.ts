import { expect, it } from "vitest";
import { mediaContentType } from "../server/media.js";

it("maps supported video and audio containers to their actual media type", () => {
  expect(mediaContentType("clip.mp4")).toBe("video/mp4");
  expect(mediaContentType("clip.mov")).toBe("video/quicktime");
  expect(mediaContentType("clip.webm")).toBe("video/webm");
  expect(mediaContentType("clip.mkv")).toBe("video/x-matroska");
  expect(mediaContentType("clip.wav")).toBe("audio/wav");
  expect(mediaContentType("clip.mp3")).toBe("audio/mpeg");
  expect(mediaContentType("clip.unknown")).toBe("application/octet-stream");
});
