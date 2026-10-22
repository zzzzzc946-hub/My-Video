import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverTranscriptBindings } from "../server/transcript.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);
const rootWithTranscripts = async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-transcript-bind-"));
  roots.push(root);
  await mkdir(join(root, "transcripts"));
  return root;
};

describe("transcript discovery", () => {
  it("automatically binds a uniquely available transcript in a single-source project", async () => {
    const root = await rootWithTranscripts();
    await writeFile(join(root, "transcripts", "采访全文.json"), JSON.stringify({ audio_duration_secs: 12, words: [] }));
    const result = await discoverTranscriptBindings(root, [{ id: "camera", durationSeconds: 12 }]);
    expect(result.references).toEqual([expect.objectContaining({ sourceId: "camera" })]);
    expect(result.status).toBe("automatic");
  });

  it("does not load duplicate copies of the same single-source transcript twice", async () => {
    const root = await rootWithTranscripts();
    const payload = { audio_duration_secs: 12, words: [{ text: "你好", start: 1, end: 1.2 }] };
    await writeFile(join(root, "transcripts", "camera.采访.json"), JSON.stringify(payload));
    await writeFile(join(root, "transcripts", "采访.json"), JSON.stringify(payload));
    const result = await discoverTranscriptBindings(root, [{ id: "camera", durationSeconds: 12 }]);
    expect(result.references.filter((reference) => reference.sourceId === "camera")).toHaveLength(1);
    expect(result.status).toBe("automatic");
  });

  it("uses transcript duration metadata for a unique multi-source match", async () => {
    const root = await rootWithTranscripts();
    await writeFile(join(root, "transcripts", "第一段.json"), JSON.stringify({ audio_duration_secs: 9.9, words: [] }));
    const result = await discoverTranscriptBindings(root, [
      { id: "a", durationSeconds: 10 },
      { id: "b", durationSeconds: 30 },
    ]);
    expect(result.references[0]?.sourceId).toBe("a");
    expect(result.status).toBe("automatic");
  });

  it("surfaces an ambiguous multi-source transcript instead of silently leaving the UI empty", async () => {
    const root = await rootWithTranscripts();
    await writeFile(join(root, "transcripts", "未知.json"), JSON.stringify({ audio_duration_secs: 10, words: [] }));
    const result = await discoverTranscriptBindings(root, [
      { id: "a", durationSeconds: 10 },
      { id: "b", durationSeconds: 10.1 },
    ]);
    expect(result.status).toBe("needs-selection");
    expect(result.references[0]?.sourceId).toBeUndefined();
    expect(result.unresolved[0]?.candidateSourceIds).toEqual(["a", "b"]);
  });
});
