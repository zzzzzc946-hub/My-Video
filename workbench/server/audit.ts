import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { AuditEvent } from "../shared/model.js";
import { canonicalProjectRoot, ensureSecureDirectory, safeChildPath } from "./security.js";

const eventPath = async (candidateRoot: string) => {
  const root = await canonicalProjectRoot(candidateRoot);
  const workbench = await ensureSecureDirectory(root, "workbench");
  return safeChildPath(workbench, "events.jsonl");
};

export const readAuditEvents = async (candidateRoot: string): Promise<AuditEvent[]> => {
  const path = await eventPath(candidateRoot);
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error("Audit log must be a regular file");
    return (await readFile(path, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as AuditEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

export const appendAuditEvent = async (candidateRoot: string, input: Omit<AuditEvent, "id" | "timestamp">): Promise<AuditEvent> => {
  if (!input.type || !input.summary || !["user", "codex", "system"].includes(input.actor)) throw new Error("Invalid audit event");
  const path = await eventPath(candidateRoot);
  const event: AuditEvent = { id: randomUUID(), timestamp: new Date().toISOString(), ...input };
  const handle = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try { await handle.write(`${JSON.stringify(event)}\n`); } finally { await handle.close(); }
  return event;
};
