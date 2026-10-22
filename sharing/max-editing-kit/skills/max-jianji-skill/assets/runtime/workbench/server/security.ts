import { lstat, mkdir, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

const MEDIA_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mp3", ".wav", ".m4a", ".aac"]);
const CREDENTIAL_NAMES = /^(\.env(?:\..*)?|.*(?:credential|secret|token|api[-_]?key).*)$/i;

export const isWithin = (root: string, candidate: string) => {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

export const canonicalProjectRoot = async (candidate: string) => {
  if (!isAbsolute(candidate)) throw new Error("Project root must be an absolute path");
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) throw new Error("Project root symlink is not allowed");
  if (!info.isDirectory()) throw new Error("Project root must be a directory");
  return realpath(candidate);
};

export const ensureSecureDirectory = async (projectRoot: string, ...parts: string[]) => {
  let cursor = projectRoot;
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.includes("/") || part.includes("\\")) throw new Error("Invalid workbench directory component");
    cursor = join(cursor, part);
    await mkdir(cursor, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error(`${part} symlink escape is not allowed`);
    if (!info.isDirectory()) throw new Error(`${part} must be a directory`);
    const canonical = await realpath(cursor);
    if (!isWithin(projectRoot, canonical)) throw new Error(`${part} directory escapes project root`);
    cursor = canonical;
  }
  return cursor;
};

export const validateMediaCandidatePath = (candidate: string) => {
  if (!isAbsolute(candidate)) throw new Error("Media path must be absolute");
  const name = basename(candidate);
  if (CREDENTIAL_NAMES.test(name) || !MEDIA_EXTENSIONS.has(extname(name).toLowerCase())) throw new Error("Media path has a forbidden credential name or unsupported media extension");
  return candidate;
};

export const authorizeMediaFile = async (candidate: string) => {
  validateMediaCandidatePath(candidate);
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) throw new Error("Media symlink is not allowed");
  if (!info.isFile()) throw new Error("Media path must be a regular file");
  return realpath(candidate);
};

export const assertAuthorizedMedia = async (candidate: string, allowedPaths: Iterable<string>) => {
  const canonical = await authorizeMediaFile(candidate);
  if (!new Set(allowedPaths).has(canonical)) throw new Error("Media file is not in the project source allowlist");
  return canonical;
};

export const authorizeProxyFile = async (projectRoot: string, candidate: string) => {
  const proxies = await ensureSecureDirectory(projectRoot, "workbench", "proxies");
  const info = await lstat(candidate);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("Proxy must be a regular non-symlink file");
  const canonical = await realpath(candidate);
  if (!isWithin(proxies, canonical)) throw new Error("Proxy file escapes the secured proxy directory");
  return canonical;
};

export const safeChildPath = (parent: string, filename: string) => {
  const path = resolve(parent, filename);
  if (!isWithin(parent, path) || path === parent) throw new Error("Resolved workbench path escapes its parent directory");
  return path;
};
