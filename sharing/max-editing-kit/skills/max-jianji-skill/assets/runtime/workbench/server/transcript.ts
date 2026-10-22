import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { SourceMedia, TranscriptBindingIssue, TranscriptBindingStatus, TranscriptReference } from "../shared/model.js";
import { isWithin, safeChildPath } from "./security.js";

export type TranscriptCue = { sourceId: string; text: string; start: number; end: number; speaker?: string };

type BindingSource = Pick<SourceMedia, "id" | "durationSeconds">;
export type TranscriptBindingResult = {
  references: TranscriptReference[];
  unresolved: TranscriptBindingIssue[];
  status: TranscriptBindingStatus;
};

const exists = async (path: string) => access(path).then(() => true).catch(() => false);
const explicitSourceId = (payload: Record<string, unknown>) => {
  for (const value of [payload.sourceId, payload.source_id, (payload.metadata as Record<string, unknown> | undefined)?.sourceId])
    if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
};

export const discoverTranscriptBindings = async (
  root: string,
  sources: BindingSource[],
): Promise<TranscriptBindingResult> => {
  const canonicalRoot = await realpath(root);
  const directory = join(canonicalRoot, "transcripts");
  if (!(await exists(directory))) return { references: [], unresolved: [], status: "none" };
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(canonicalRoot, await realpath(directory)))
    throw new Error("Transcript directory escapes project root");
  const references: TranscriptReference[] = [];
  const unresolved: TranscriptBindingIssue[] = [];
  const boundSignatures = new Set<string>();
  for (const filename of (await readdir(directory)).filter((entry) => entry.endsWith(".json")).sort()) {
    const path = safeChildPath(directory, filename);
    const fileInfo = await lstat(path);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) continue;
    const canonical = await realpath(path);
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(await readFile(canonical, "utf8")) as Record<string, unknown>; } catch { /* keep an invalid transcript visible but unresolved */ }
    const named = sources.find((source) => filename.toLowerCase().startsWith(source.id.toLowerCase()));
    const explicit = explicitSourceId(payload);
    const explicitMatch = explicit ? sources.find((source) => source.id === explicit) : undefined;
    const transcriptDuration = Number(payload.audio_duration_secs ?? payload.durationSeconds ?? payload.duration);
    const words = Array.isArray(payload.words) ? payload.words : [];
    const signature = JSON.stringify([
      Number.isFinite(transcriptDuration) ? transcriptDuration : null,
      words.length,
      words[0] ?? null,
      words.at(-1) ?? null,
    ]);
    const durationMatches = Number.isFinite(transcriptDuration)
      ? sources.filter((source) => source.durationSeconds !== undefined && Math.abs(source.durationSeconds - transcriptDuration) <= Math.max(1, transcriptDuration * 0.02))
      : [];
    const automatic = named ?? explicitMatch ?? (durationMatches.length === 1 ? durationMatches[0] : undefined) ?? (sources.length === 1 ? sources[0] : undefined);
    const sourceId = automatic && !boundSignatures.has(`${automatic.id}:${signature}`)
      ? automatic.id
      : undefined;
    if (sourceId) boundSignatures.add(`${sourceId}:${signature}`);
    references.push({ path: canonical, label: filename, sourceId });
    if (automatic && !sourceId) continue;
    if (!automatic) unresolved.push({
      path: canonical,
      label: filename,
      candidateSourceIds: durationMatches.length > 1 ? durationMatches.map((source) => source.id) : sources.map((source) => source.id),
    });
  }
  return {
    references,
    unresolved,
    status: references.length === 0 ? "none" : unresolved.length ? "needs-selection" : "automatic",
  };
};

export const parseScribeTranscript = (sourceId: string, payload: unknown): TranscriptCue[] => {
  const words = typeof payload === "object" && payload && "words" in payload ? (payload as { words?: unknown[] }).words : [];
  return (words ?? []).flatMap((word) => {
    if (!word || typeof word !== "object") return [];
    const entry = word as Record<string, unknown>;
    const start = Number(entry.start);
    const end = Number(entry.end);
    const text = String(entry.text ?? entry.word ?? "").trim();
    return Number.isFinite(start) && Number.isFinite(end) && text ? [{ sourceId, text, start, end, speaker: typeof entry.speaker_id === "string" ? entry.speaker_id : undefined }] : [];
  });
};
