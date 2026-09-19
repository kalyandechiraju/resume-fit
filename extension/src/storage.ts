import {
  LIMITS,
  type AssessmentInputs,
  type CaptureEnvelope,
  type EvaluationConnection,
  type JobConfirmed,
  type ResumeDocument,
  isEvaluationProvider,
  newOpaqueVersion,
} from "./domain";

export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export type StorageAreas = Readonly<{
  local: StorageAreaLike;
  session: StorageAreaLike;
}>;

export const STORAGE_KEYS = {
  resume: "resumeFit.resume",
  job: "resumeFit.job",
  apiKey: "resumeFit.apiKey",
  latestCaptureAttempt: "resumeFit.latestCaptureAttempt",
} as const;

const captureKey = (attemptId: string): string => `resumeFit.capture.${attemptId}`;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function parseResume(value: unknown): ResumeDocument | null {
  const item = record(value);
  if (!item) return null;
  const resumeVersion = boundedString(item.resumeVersion, 100);
  const fileName = boundedString(item.fileName, 255);
  const text = typeof item.text === "string" && item.text.length <= LIMITS.resumeChars ? item.text : null;
  const format = item.format === "pdf" || item.format === "docx" ? item.format : null;
  const pageCount = item.pageCount === null ? null : typeof item.pageCount === "number" && Number.isInteger(item.pageCount) && item.pageCount > 0 ? item.pageCount : null;
  if (!resumeVersion || !fileName || !text || !format || text.trim().length === 0) return null;
  return { resumeVersion, fileName, format, text, pageCount };
}

function parseJob(value: unknown): JobConfirmed | null {
  const item = record(value);
  if (!item) return null;
  const kind = item.kind === "confirmed" ? item.kind : null;
  const jobVersion = boundedString(item.jobVersion, 100);
  const source = item.source === "captured" || item.source === "pasted" ? item.source : null;
  const title = typeof item.title === "string" && item.title.length <= 300 ? item.title : null;
  const url = item.url === null ? null : typeof item.url === "string" && item.url.length <= 2048 ? item.url : null;
  const text = typeof item.text === "string" && item.text.length <= LIMITS.captureChars ? item.text : null;
  if (!kind || !jobVersion || !source || title === null || url === undefined || !text || text.trim().length === 0 || text.length > LIMITS.captureChars) return null;
  const common: { jobVersion: string; source: "captured" | "pasted"; title: string; url: string | null; text: string } = { jobVersion, source, title, url, text };
  return { kind: "confirmed", ...common };
}

function parseApiKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 512 ? trimmed : null;
}

function parseConnection(value: unknown): EvaluationConnection | null {
  if (typeof value === "string") {
    const apiKey = parseApiKey(value);
    return apiKey ? { provider: "vercel-gateway", apiKey } : null;
  }
  const item = record(value);
  if (!item || !isEvaluationProvider(item.provider)) return null;
  const apiKey = parseApiKey(item.apiKey);
  return apiKey ? { provider: item.provider, apiKey } : null;
}

function parseCapture(value: unknown): CaptureEnvelope | null {
  const item = record(value);
  if (!item || typeof item.captureAttemptId !== "string" || item.captureAttemptId.length > 100) return null;
  if (item.kind === "capture-failed" && (item.code === "protected-page" || item.code === "empty-page" || item.code === "page-too-large" || item.code === "unavailable")) {
    return { kind: "capture-failed", captureAttemptId: item.captureAttemptId, code: item.code };
  }
  if (item.kind === "captured" && typeof item.title === "string" && item.title.length <= 300 && typeof item.url === "string" && item.url.length <= 2048 && typeof item.text === "string" && item.text.length > 0 && item.text.length <= LIMITS.captureChars) {
    return { kind: "captured", captureAttemptId: item.captureAttemptId, title: item.title, url: item.url, text: item.text };
  }
  return null;
}

export async function loadAssessment(storage: StorageAreas): Promise<AssessmentInputs> {
  const [local, session] = await Promise.all([
    storage.local.get(STORAGE_KEYS.resume),
    storage.session.get([STORAGE_KEYS.job, STORAGE_KEYS.apiKey]),
  ]);
  return {
    resume: parseResume(local[STORAGE_KEYS.resume]),
    job: parseJob(session[STORAGE_KEYS.job]),
    connection: parseConnection(session[STORAGE_KEYS.apiKey]),
  };
}

export async function saveResume(storage: StorageAreas, resume: ResumeDocument): Promise<void> {
  await storage.local.set({ [STORAGE_KEYS.resume]: resume });
}

export async function deleteResume(storage: StorageAreas): Promise<void> {
  await storage.local.remove(STORAGE_KEYS.resume);
}

export async function saveJobConfirmed(storage: StorageAreas, job: Omit<JobConfirmed, "kind" | "jobVersion">): Promise<JobConfirmed> {
  const confirmed: JobConfirmed = { kind: "confirmed", jobVersion: newOpaqueVersion(), ...job };
  await storage.session.set({ [STORAGE_KEYS.job]: confirmed });
  return confirmed;
}

export async function deleteJob(storage: StorageAreas): Promise<void> {
  await storage.session.remove(STORAGE_KEYS.job);
}

export async function saveConnection(storage: StorageAreas, connection: EvaluationConnection): Promise<void> {
  const parsed = parseConnection(connection);
  if (!parsed) throw new Error("Invalid evaluation connection.");
  await storage.session.set({ [STORAGE_KEYS.apiKey]: parsed });
}

export async function deleteConnection(storage: StorageAreas): Promise<void> {
  await storage.session.remove(STORAGE_KEYS.apiKey);
}

export async function beginCapture(storage: StorageAreas, captureAttemptId: string): Promise<void> {
  await storage.session.set({ [STORAGE_KEYS.latestCaptureAttempt]: captureAttemptId });
}

export async function saveCapture(storage: StorageAreas, envelope: CaptureEnvelope): Promise<void> {
  await storage.session.set({ [captureKey(envelope.captureAttemptId)]: envelope });
}

export async function consumeLatestCapture(storage: StorageAreas): Promise<CaptureEnvelope | null> {
  const marker = await storage.session.get(STORAGE_KEYS.latestCaptureAttempt);
  const rawAttemptId = marker[STORAGE_KEYS.latestCaptureAttempt];
  const attemptId = typeof rawAttemptId === "string" ? rawAttemptId : null;
  if (!attemptId) return null;
  const result = await storage.session.get(captureKey(attemptId));
  const envelope = parseCapture(result[captureKey(attemptId)]);
  if (envelope) await storage.session.remove([captureKey(attemptId), STORAGE_KEYS.latestCaptureAttempt]);
  return envelope;
}

export function parseStoredJob(value: unknown): JobConfirmed | null {
  return parseJob(value);
}

export function parseStoredResume(value: unknown): ResumeDocument | null {
  return parseResume(value);
}

export function parseStoredConnection(value: unknown): EvaluationConnection | null {
  return parseConnection(value);
}
