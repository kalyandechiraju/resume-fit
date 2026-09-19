export const LIMITS = {
  captureChars: 50_000,
  resumeBytes: 5_000_000,
  resumePages: 20,
  resumeChars: 40_000,
  maxSpans: 64,
  maxSpanChars: 500,
  responseBytes: 512_000,
  requestTimeoutMs: 15_000,
} as const;

export type ResumeFormat = "pdf" | "docx";

export type EvaluationProvider = "vercel-gateway" | "typesafe-direct";

export type EvaluationConnection = Readonly<{
  provider: EvaluationProvider;
  apiKey: string;
}>;

export type OpaqueVersion = string;

export type ResumeDocument = Readonly<{
  resumeVersion: OpaqueVersion;
  fileName: string;
  format: ResumeFormat;
  text: string;
  pageCount: number | null;
}>;

export type JobConfirmed = Readonly<{
  kind: "confirmed";
  jobVersion: OpaqueVersion;
  source: "captured" | "pasted";
  title: string;
  url: string | null;
  text: string;
}>;

export type AssessmentInputs = Readonly<{
  resume: ResumeDocument | null;
  job: JobConfirmed | null;
  connection: EvaluationConnection | null;
}>;

export type ResumeMetadata = Readonly<{
  resumeVersion: OpaqueVersion;
  fileName: string;
  format: ResumeFormat;
  pageCount: number | null;
}>;

export type JobMetadata = Readonly<{
  jobVersion: OpaqueVersion;
  source: "captured" | "pasted";
  title: string;
  url: string | null;
}>;

export type InputSnapshot = Readonly<{
  resume: ResumeMetadata | null;
  job: JobMetadata | null;
  provider: EvaluationProvider | null;
}>;

export type AnalysisSnapshot = Readonly<{
  resumeVersion: OpaqueVersion;
  jobVersion: OpaqueVersion;
}>;

export type SourceSpan = Readonly<{
  text: string;
  start: number;
  end: number;
}>;

export const FIT_METRICS = [
  { metric: "experience", label: "Experience match", weight: 30 },
  { metric: "skillset", label: "Skillset match", weight: 30 },
  { metric: "responsibility", label: "Responsibility match", weight: 25 },
  { metric: "qualification", label: "Qualifications match", weight: 15 },
] as const;

export type FitMetric = (typeof FIT_METRICS)[number]["metric"];
export type RequirementImportance = "required" | "preferred";
export type Alignment = "clear" | "partial" | "related" | "no-match";

export type Requirement = Readonly<{
  metric: FitMetric;
  importance: RequirementImportance;
  requirement: SourceSpan;
}>;

export type RequirementEvidence =
  | Readonly<{
      metric: FitMetric;
      importance: RequirementImportance;
      alignment: "no-match";
      requirement: SourceSpan;
      resumeEvidence: null;
    }>
  | Readonly<{
      metric: FitMetric;
      importance: RequirementImportance;
      alignment: "related" | "partial" | "clear";
      requirement: SourceSpan;
      resumeEvidence: SourceSpan;
    }>;

export type FitMetricResult =
  | Readonly<{
      kind: "not-applicable";
      metric: FitMetric;
      label: string;
      weight: number;
    }>
  | Readonly<{
      kind: "scored";
      metric: FitMetric;
      label: string;
      weight: number;
      score: number;
    }>;

export type FitMetricResults = readonly [
  FitMetricResult,
  FitMetricResult,
  FitMetricResult,
  FitMetricResult,
];

export type FitReport =
  | Readonly<{
      kind: "scored";
      score: number;
      metrics: FitMetricResults;
    }>
  | Readonly<{
      kind: "insufficient-job-requirements";
    }>;

export type CaptureFailureCode =
  | "protected-page"
  | "empty-page"
  | "page-too-large"
  | "unavailable";

export type CaptureEnvelope =
  | Readonly<{
      kind: "captured";
      captureAttemptId: string;
      title: string;
      url: string;
      text: string;
    }>
  | Readonly<{
      kind: "capture-failed";
      captureAttemptId: string;
      code: CaptureFailureCode;
    }>;

export function newOpaqueVersion(): OpaqueVersion {
  return crypto.randomUUID();
}

export function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .trim();
}

export function normalizeForComparison(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function isEvaluationProvider(value: unknown): value is EvaluationProvider {
  return value === "vercel-gateway" || value === "typesafe-direct";
}

export function snapshotForInputs(inputs: AssessmentInputs): InputSnapshot {
  return {
    resume: inputs.resume ? {
      resumeVersion: inputs.resume.resumeVersion,
      fileName: inputs.resume.fileName,
      format: inputs.resume.format,
      pageCount: inputs.resume.pageCount,
    } : null,
    job: inputs.job ? {
      jobVersion: inputs.job.jobVersion,
      source: inputs.job.source,
      title: inputs.job.title,
      url: inputs.job.url,
    } : null,
    provider: inputs.connection?.provider ?? null,
  };
}

export function analysisSnapshot(inputs: AssessmentInputs): AnalysisSnapshot | null {
  if (!inputs.resume || !inputs.job) return null;
  return {
    resumeVersion: inputs.resume.resumeVersion,
    jobVersion: inputs.job.jobVersion,
  };
}
