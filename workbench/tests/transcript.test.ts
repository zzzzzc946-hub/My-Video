import { expect, it } from "vitest";
import { parseScribeTranscript } from "../server/transcript.js";

it("parses VideoUse Scribe words into source-linked cue data", () => {
  expect(parseScribeTranscript("source-a", { words: [{ text: "你好", start: 1.2, end: 1.5, speaker_id: "S0" }] })).toEqual([{ sourceId: "source-a", text: "你好", start: 1.2, end: 1.5, speaker: "S0" }]);
});
