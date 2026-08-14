const shaPattern = /^[0-9a-f]{40}$/;
const releaseIdPattern = /^MAX-RULES-\d{8}-\d{3}$/;

export type FrozenRuleSnapshot = Readonly<{
  formalSha: string;
  myVideoSha: string;
  releaseId: string;
  candidateIds: readonly string[];
}>;

export type SnapshotInput = {
  formalSha: string;
  myVideoSha: string;
  releaseId: string;
  candidateIds: readonly string[];
};

export const createFrozenRuleSnapshot = (input: SnapshotInput): FrozenRuleSnapshot => {
  if (!shaPattern.test(input.formalSha)) throw new Error("formalSha must be a 40-character lowercase SHA");
  if (!shaPattern.test(input.myVideoSha)) throw new Error("myVideoSha must be a 40-character lowercase SHA");
  if (!releaseIdPattern.test(input.releaseId)) throw new Error("releaseId must match MAX-RULES-YYYYMMDD-NNN");
  if (input.candidateIds.length > 3) throw new Error("candidateIds may contain at most 3 entries");
  if (new Set(input.candidateIds).size !== input.candidateIds.length) throw new Error("candidateIds must be unique");
  return Object.freeze({
    formalSha: input.formalSha,
    myVideoSha: input.myVideoSha,
    releaseId: input.releaseId,
    candidateIds: Object.freeze([...input.candidateIds]),
  });
};

export const calculateTokenPerFinishedMinute = (
  actualTokenUsage: number,
  finalDurationSeconds: number,
) => {
  if (!Number.isFinite(actualTokenUsage) || actualTokenUsage < 0)
    throw new Error("actual non-negative token usage is required");
  if (!Number.isFinite(finalDurationSeconds) || finalDurationSeconds <= 0)
    throw new Error("positive final duration is required");
  return actualTokenUsage / (finalDurationSeconds / 60);
};
