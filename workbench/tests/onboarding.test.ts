import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectProject, openProject, saveDraft } from "../server/repository.js";

const roots: string[] = [];
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-onboarding-"));
  roots.push(root);
  const media = join(root, "clip.mp4");
  const edl = (start: number) => ({
    version: 1,
    sources: { camera: media },
    ranges: [{ source: "camera", start, end: start + 1 }],
    grade: "none",
    overlays: [],
    total_duration_s: 1,
  });
  await writeFile(join(root, "edl.v001.json"), JSON.stringify(edl(0)));
  await writeFile(join(root, "edl.v002.json"), JSON.stringify(edl(1)));
  return root;
};

afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

describe("project onboarding", () => {
  it("lists every EDL candidate with metadata and refuses an ambiguous implicit selection", async () => {
    const root = await fixture();
    const inspection = await inspectProject(root);
    expect(inspection.edlCandidates.map((candidate) => candidate.filename)).toEqual([
      "edl.v001.json",
      "edl.v002.json",
    ]);
    expect(inspection.edlCandidates[0]).toEqual(
      expect.objectContaining({ sourceCount: 1, rangeCount: 1, durationSeconds: 1 }),
    );
    await expect(openProject(root)).rejects.toThrow(/select.*EDL|EDL.*select/i);
  });

  it("keeps a continued draft authoritative and archives it before creating a fresh isolated draft", async () => {
    const root = await fixture();
    const firstPath = join(root, "edl.v001.json");
    const secondPath = join(root, "edl.v002.json");
    const first = await openProject(root, { edlPath: firstPath, draftMode: "new" });
    const edited = {
      ...first,
      timeline: {
        ...first.timeline,
        segments: first.timeline.segments.map((segment) => ({ ...segment, reason: "用户保留的编辑" })),
      },
    };
    await saveDraft(root, edited);
    const continued = await openProject(root, { edlPath: firstPath, draftMode: "continue" });
    expect(continued.timeline.segments[0]?.reason).toBe("用户保留的编辑");
    expect(continued.authority?.draftSource).toBe("working-draft");

    const fresh = await openProject(root, { edlPath: secondPath, draftMode: "new" });
    expect(fresh.timeline.segments[0]?.sourceIn).toBe(1);
    expect(fresh.timeline.segments[0]?.reason).not.toBe("用户保留的编辑");
    expect(fresh.authority).toEqual(
      expect.objectContaining({ selectedEdlPath: await realpath(secondPath), draftSource: "selected-edl" }),
    );
    const archived = await readdir(join(root, "workbench", "drafts"));
    expect(archived).toHaveLength(1);
    expect(await readFile(join(root, "workbench", "drafts", archived[0]!), "utf8")).toContain(
      "用户保留的编辑",
    );
  });

  it("reports an existing draft so the UI must choose continue or new", async () => {
    const root = await fixture();
    await openProject(root, { edlPath: join(root, "edl.v001.json"), draftMode: "new" });
    const inspection = await inspectProject(root);
    expect(inspection.workingDraft).toEqual(
      expect.objectContaining({ exists: true, selectedEdlPath: await realpath(join(root, "edl.v001.json")) }),
    );
  });
});
