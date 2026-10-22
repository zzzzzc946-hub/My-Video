import { mkdtemp, mkdir, readFile, realpath, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { openProject, restoreVersion, saveDraft, snapshot } from "../server/repository.js";
import { applyTimelineOperation } from "../shared/timeline.js";
import { proxyPathFor } from "../server/media.js";

const roots: string[] = [];
const execFileAsync = promisify(execFile);
const createMedia = async (path: string, duration = 6) => execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=black:s=16x16:d=${duration}`, "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${duration}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path]);
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-workbench-"));
  roots.push(root);
  const media = join(root, "采访.mp4");
  await createMedia(media);
  await writeFile(join(root, "edl.json"), JSON.stringify({ version: 1, sources: { C1: media }, ranges: [{ source: "C1", start: 1, end: 5 }], grade: "none", overlays: [], total_duration_s: 4 }));
  return root;
};
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("project repository", () => {
  it("initializes an isolated workbench draft from a VideoUse EDL", async () => {
    const root = await fixture();
    const project = await openProject(root);
    expect(project.timeline.segments).toHaveLength(1);
    expect(JSON.parse(await readFile(join(root, "workbench", "project.json"), "utf8")).schemaVersion).toBe(1);
    expect(project.sources[0]?.originalPath).toBe(await realpath(join(root, "采访.mp4")));
  });

  it("saves a draft and restores history by creating a new working draft", async () => {
    const root = await fixture();
    const initial = await openProject(root);
    const version = await snapshot(root, initial, "initial cut");
    const edited = applyTimelineOperation(initial, { type: "trim", segmentId: initial.timeline.segments[0]!.id, sourceIn: 2, sourceOut: 5 });
    await saveDraft(root, edited);
    const restored = await restoreVersion(root, version.id);
    expect(restored.timeline.segments[0]?.sourceIn).toBe(1);
    expect(restored.currentVersionId).toBe(version.id);
  });

  it("derives version history and the next ID from immutable files, not a shortened draft array", async () => {
    const root = await fixture();
    const initial = await openProject(root);
    await snapshot(root, initial, "first");
    const v1Path = join(root, "workbench", "versions", "v001.json");
    const v1Before = await readFile(v1Path, "utf8");
    const draftPath = join(root, "workbench", "working-draft.json");
    const draft = JSON.parse(await readFile(draftPath, "utf8"));
    await writeFile(draftPath, JSON.stringify({ ...draft, versions: [], currentVersionId: null }));
    const reopened = await openProject(root);
    expect(reopened.versions.map((version) => version.id)).toEqual(["v001"]);
    const second = await snapshot(root, { ...reopened, versions: [] }, "second");
    expect(second.id).toBe("v002");
    expect(await readFile(v1Path, "utf8")).toBe(v1Before);
  });

  it("skips pre-existing regular version IDs and rejects a version symlink", async () => {
    const root = await fixture(); const project = await openProject(root);
    const versions = join(root, "workbench", "versions");
    await writeFile(join(versions, "v001.json"), JSON.stringify({ reserved: true }));
    const next = await snapshot(root, project, "after reservation");
    expect(next.id).toBe("v002");
    const outside = await mkdtemp(join(tmpdir(), "videouse-version-outside-")); roots.push(outside);
    const sentinel = join(outside, "sentinel.json"); await writeFile(sentinel, "sentinel");
    await symlink(sentinel, join(versions, "v003.json"));
    await expect(snapshot(root, project, "must reject link")).rejects.toThrow(/version.*symlink|symlink.*version/i);
    expect(await readFile(sentinel, "utf8")).toBe("sentinel");
  });

  it("publishes a version with exclusive creation under concurrent snapshot attempts", async () => {
    const root = await fixture(); const project = await openProject(root);
    const attempts = await Promise.allSettled([snapshot(root, project, "one"), snapshot(root, project, "two")]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = JSON.parse(await readFile(join(root, "workbench", "versions", "v001.json"), "utf8"));
    expect(saved.currentVersionId).toBe("v001");
  });

  it("migrates newly discovered transcripts into an old draft without replacing timeline edits", async () => {
    const root = await fixture();
    const initial = await openProject(root);
    const edited = applyTimelineOperation(initial, { type: "trim", segmentId: initial.timeline.segments[0]!.id, sourceIn: 2, sourceOut: 5 });
    await saveDraft(root, edited);
    await (await import("node:fs/promises")).mkdir(join(root, "transcripts"));
    await writeFile(join(root, "transcripts", "C1.json"), JSON.stringify({ words: [] }));
    const reopened = await openProject(root);
    expect(reopened.timeline.segments[0]?.sourceIn).toBe(2);
    expect(reopened.transcripts).toEqual([expect.objectContaining({ sourceId: "C1" })]);
  });

  it("ignores a serialized draft rootPath and keeps writes under the opened canonical root", async () => {
    const root = await fixture();
    const project = await openProject(root);
    const escape = await mkdtemp(join(tmpdir(), "videouse-escape-"));
    roots.push(escape);
    await writeFile(join(root, "workbench", "working-draft.json"), JSON.stringify({ ...project, rootPath: escape }));
    const reopened = await openProject(root);
    expect(reopened.rootPath).toBe(await realpath(root));
    expect(await readFile(join(root, "workbench", "working-draft.json"), "utf8")).toContain(await realpath(root));
  });

  it("drops an untrusted draft proxyPath outside the secured proxy directory", async () => {
    const root = await fixture();
    const project = await openProject(root);
    const escape = await mkdtemp(join(tmpdir(), "videouse-proxy-escape-"));
    roots.push(escape);
    const outside = join(escape, "stolen.mp4");
    await createMedia(outside, 1);
    await writeFile(join(root, "workbench", "working-draft.json"), JSON.stringify({ ...project, sources: [{ ...project.sources[0], proxyPath: outside }] }));
    const reopened = await openProject(root);
    expect(reopened.sources[0]?.proxyPath).toBeUndefined();
  });

  it("rejects a workbench symlink that escapes the opened project root", async () => {
    const root = await fixture();
    const escape = await mkdtemp(join(tmpdir(), "videouse-symlink-escape-"));
    roots.push(escape);
    await symlink(escape, join(root, "workbench"));
    await expect(openProject(root)).rejects.toThrow(/workbench.*escape|symlink/i);
  });

  it("keeps unsafe EDL source paths unresolved instead of reading them", async () => {
    const root = await fixture();
    const secret = join(root, ".env");
    await writeFile(secret, "TOKEN=secret");
    await writeFile(join(root, "edl.json"), JSON.stringify({ sources: { C1: secret }, ranges: [{ source: "C1", start: 0, end: 1 }] }));
    await expect(openProject(root)).resolves.toEqual(expect.objectContaining({ sources: [expect.objectContaining({ linkState: "relink-required" })] }));

    const mediaDirectory = join(root, "media-dir.mp4");
    await mkdir(mediaDirectory);
    await writeFile(join(root, "edl.json"), JSON.stringify({ sources: { C1: mediaDirectory }, ranges: [{ source: "C1", start: 0, end: 1 }] }));
    await expect(openProject(root)).resolves.toEqual(expect.objectContaining({ sources: [expect.objectContaining({ linkState: "relink-required" })] }));

    const external = await mkdtemp(join(tmpdir(), "videouse-media-target-"));
    roots.push(external);
    const target = join(external, "target.mp4");
    await createMedia(target, 1);
    const linked = join(root, "linked.mp4");
    await symlink(target, linked);
    await writeFile(join(root, "edl.json"), JSON.stringify({ sources: { C1: linked }, ranges: [{ source: "C1", start: 0, end: 1 }] }));
    await expect(openProject(root)).resolves.toEqual(expect.objectContaining({ sources: [expect.objectContaining({ linkState: "relink-required" })] }));
  });

  it("does not trust an external media path merely because the EDL names it", async () => {
    const root = await fixture();
    const external = await mkdtemp(join(tmpdir(), "videouse-authorized-media-"));
    roots.push(external);
    const media = join(external, "source.mp4");
    await createMedia(media, 1);
    await writeFile(join(root, "edl.json"), JSON.stringify({ sources: { C1: media }, ranges: [{ source: "C1", start: 0, end: 1 }] }));
    const project = await openProject(root);
    expect(project.sources[0]).toEqual(expect.objectContaining({ originalPath: await realpath(media), linkState: "relink-required" }));
    expect(project.sources[0]?.durationSeconds).toBeUndefined();
    expect(project.timeline.segments).toHaveLength(1);
  });

  it("opens a project with a missing source and still discovers transcript and timeline facts", async () => {
    const root = await fixture();
    await rm(join(root, "采访.mp4"));
    await mkdir(join(root, "transcripts"));
    await writeFile(join(root, "transcripts", "C1.json"), JSON.stringify({ words: [{ word: "仍", start: 1, end: 1.1 }] }));
    const project = await openProject(root);
    expect(project.sources[0]).toEqual(expect.objectContaining({ linkState: "missing" }));
    expect(project.sources[0]?.durationSeconds).toBeUndefined();
    expect(project.timeline.segments).toHaveLength(1);
    expect(project.transcripts).toEqual([expect.objectContaining({ sourceId: "C1" })]);
  });

  it("detects same-path same-size replacement and drops the stale proxy", async () => {
    const root = await fixture();
    const first = await openProject(root);
    const sourcePath = join(root, "采访.mp4");
    const beforeStat = await stat(sourcePath);
    const proxy = await proxyPathFor(root, first.sources[0]!);
    await writeFile(proxy, "old proxy");
    await saveDraft(root, { ...first, sources: [{ ...first.sources[0]!, proxyPath: proxy }] });
    const replacement = join(root, "replacement.mp4");
    await createMedia(replacement);
    expect((await stat(replacement)).size).toBe(beforeStat.size);
    await rename(replacement, sourcePath);
    await utimes(sourcePath, beforeStat.atime, beforeStat.mtime);
    const reopened = await openProject(root);
    expect(reopened.sources[0]?.fingerprint).not.toBe(first.sources[0]?.fingerprint);
    expect(reopened.sources[0]?.linkState).toBe("changed");
    expect(reopened.sources[0]?.proxyPath).toBeUndefined();
  });
});
