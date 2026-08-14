import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const governanceRoot = ["03｜CHEN操盘手系统", "03｜MAX剪辑系统", "08｜规则候选收件箱", "governance"];
const releaseIdPattern = /^MAX-RULES-\d{8}-\d{3}$/;
const shaPattern = /^[0-9a-f]{40}$/;

export type ActiveRuleRelease = Readonly<{
  releaseId: string;
  formalSha: string;
  myVideoSha: string;
  skillImpact: "none" | "required";
  reviewBatchId: string;
}>;

const parseFlatYaml = (text: string) => {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const separator = rawLine.indexOf(":");
    if (separator <= 0) throw new Error("release YAML must use flat key: value fields");
    const key = rawLine.slice(0, separator).trim();
    const value = rawLine.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!key || !value) throw new Error("release YAML contains an empty field");
    values[key] = value;
  }
  return values;
};

const git = async (cwd: string, args: string[]) =>
  (await execFileAsync("git", args, { cwd })).stdout.trim();

export const loadActiveRuleRelease = async (
  brainRoot: string,
  myVideoRoot: string,
): Promise<ActiveRuleRelease> => {
  const root = join(brainRoot, ...governanceRoot);
  const pointer = parseFlatYaml(await readFile(join(root, "current-release.yaml"), "utf8"));
  const releaseId = pointer.release_id;
  if (!releaseIdPattern.test(releaseId ?? "")) throw new Error("current release has an invalid release_id");
  const release = parseFlatYaml(await readFile(join(root, "releases", `${releaseId}.yaml`), "utf8"));
  if (release.release_id !== releaseId || release.status !== "active")
    throw new Error("current release must point to an active matching manifest");
  if (!shaPattern.test(release.minimum_my_video_commit ?? ""))
    throw new Error("active release has an invalid minimum My-Video commit");
  if (release.skill_impact !== "none" && release.skill_impact !== "required")
    throw new Error("active release has an invalid skill impact");
  if (!release.review_batch_id) throw new Error("active release is missing its review batch");
  try {
    await git(myVideoRoot, ["cat-file", "-e", `${release.minimum_my_video_commit}^{commit}`]);
    await git(myVideoRoot, ["merge-base", "--is-ancestor", release.minimum_my_video_commit, "HEAD"]);
  } catch {
    throw new Error("active release requires a My-Video commit contained by local HEAD");
  }
  return Object.freeze({
    releaseId,
    formalSha: await git(brainRoot, ["rev-parse", "HEAD"]),
    myVideoSha: await git(myVideoRoot, ["rev-parse", "HEAD"]),
    skillImpact: release.skill_impact,
    reviewBatchId: release.review_batch_id,
  });
};
