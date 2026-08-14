import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import type { SourceMedia } from "../shared/model.js";
import { authorizeMediaFile } from "./security.js";

const execFileAsync = promisify(execFile);

export const fingerprintMedia = async (candidate: string) => {
  const path = await authorizeMediaFile(candidate);
  const info = await stat(path);
  const fingerprint = createHash("sha256").update(JSON.stringify({ path, size: info.size, mtimeMs: info.mtimeMs, ino: info.ino, dev: info.dev })).digest("hex");
  return { path, fingerprint, size: info.size, mtimeMs: info.mtimeMs, ino: info.ino, dev: info.dev };
};

export const inspectMedia = async (candidate: string) => {
  const facts = await fingerprintMedia(candidate);
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", facts.path]);
  const durationSeconds = Number(stdout.trim());
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error(`Unable to read authoritative media duration: ${facts.path}`);
  return { ...facts, durationSeconds };
};

export const sourceIsReadable = (source: SourceMedia) => source.linkState === "linked" && source.durationSeconds !== undefined && source.fingerprint !== undefined;

export const assertSourceReadable = async (source: SourceMedia) => {
  if (!sourceIsReadable(source)) throw new Error(`Source requires authorization or relinking: ${source.id}`);
  const current = await fingerprintMedia(source.originalPath);
  if (current.fingerprint !== source.fingerprint) throw new Error(`Source changed after project open: ${source.id}`);
  return current.path;
};

export const assertProjectSourcesReadable = async (project: { sources: SourceMedia[] }) => {
  for (const source of project.sources) await assertSourceReadable(source);
};
