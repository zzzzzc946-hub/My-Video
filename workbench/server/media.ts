import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import { extname } from "node:path";
import type { SourceMedia } from "../shared/model.js";
import { assertAuthorizedMedia, authorizeProxyFile, canonicalProjectRoot, ensureSecureDirectory, isWithin, safeChildPath } from "./security.js";
import { assertSourceReadable } from "./source-facts.js";

const exists = (path: string) => access(path).then(() => true).catch(() => false);
const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
};
export const mediaContentType = (path: string) => MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
const run = (command: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn(command, args, { stdio: "ignore" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});

export const proxyPathFor = async (candidateRoot: string, source: SourceMedia) => {
  const root = await canonicalProjectRoot(candidateRoot);
  const directory = await ensureSecureDirectory(root, "workbench", "proxies");
  const digest = createHash("sha256").update(`${source.id}\0${source.originalPath}\0${source.fingerprint ?? "unfingerprinted"}`).digest("hex");
  const target = safeChildPath(directory, `${digest}.mp4`);
  if (!isWithin(directory, target)) throw new Error("Proxy path escapes proxy directory");
  return target;
};

export const generateProxy = async (candidateRoot: string, source: SourceMedia, allowedMedia: Iterable<string>): Promise<SourceMedia> => {
  const root = await canonicalProjectRoot(candidateRoot);
  await assertSourceReadable(source);
  const originalPath = await assertAuthorizedMedia(source.originalPath, allowedMedia);
  const proxyPath = await proxyPathFor(root, { ...source, originalPath });
  if (await exists(proxyPath)) {
    const canonical = await authorizeProxyFile(root, proxyPath);
    return { ...source, originalPath, proxyPath: canonical, linkState: "linked" };
  }
  const proxyDirectory = await ensureSecureDirectory(root, "workbench", "proxies");
  const partPath = safeChildPath(proxyDirectory, `.${createHash("sha256").update(proxyPath).digest("hex")}.${randomUUID()}.part.mp4`);
  try {
    await run("ffmpeg", ["-y", "-i", originalPath, "-map", "0:v:0?", "-map", "0:a:0?", "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", "-r", "60", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-f", "mp4", partPath]);
    await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", partPath]);
    await assertSourceReadable(source);
    await authorizeProxyFile(root, partPath);
    await rename(partPath, proxyPath);
    await authorizeProxyFile(root, proxyPath);
    return { ...source, originalPath, proxyPath, linkState: "linked" };
  } catch (error) {
    await rm(partPath, { force: true }).catch(() => undefined);
    throw error;
  }
};
