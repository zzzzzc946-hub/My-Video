export type TranscriptCue = { sourceId: string; text: string; start: number; end: number; speaker?: string };

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
