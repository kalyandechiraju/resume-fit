import { createGateway, GatewayError } from "@ai-sdk/gateway";
import {
  experimental_evaluate as evaluate,
  type Experimental_EvaluationAnswer as EvaluationAnswer,
  type Experimental_EvaluationQuestion as EvaluationQuestion,
  InvalidResponseDataError,
  type JSONValue,
} from "ai";
import {
  FIT_METRICS,
  LIMITS,
  normalizeForComparison,
  type Alignment,
  type AnalysisSnapshot,
  type FitMetric,
  type FitMetricResult,
  type FitMetricResults,
  type FitReport,
  type QualificationBlocker,
  type Requirement,
  type RequirementEvidence,
  type RequirementImportance,
  type SourceSpan,
} from "./domain";

const MODEL_ID = "typesafe-ai/jev";

export type AnalysisPhase = "finding-requirements" | "matching-resume";

export type AnalysisErrorCode = "authentication" | "forbidden" | "rate-limit" | "service" | "timeout" | "response-too-large" | "response-invalid" | "network" | "insufficient-input";

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode;

  constructor(code: AnalysisErrorCode, message: string) {
    super(message);
    this.name = "AnalysisError";
    this.code = code;
  }
}

function gatewayAnalysisError(error: unknown): AnalysisError | null {
  if (!GatewayError.isInstance(error)) return null;
  if (error.statusCode === 401) return new AnalysisError("authentication", "Vercel rejected the Gateway key. Replace it with an active AI Gateway key.");
  if (error.statusCode === 402 || error.statusCode === 403) return new AnalysisError("forbidden", "Vercel blocked this request. Check the AI Gateway budget and access settings.");
  if (error.statusCode === 429) return new AnalysisError("rate-limit", "Vercel rate-limited the request. Wait briefly, then try again.");
  if (error.statusCode === 404) return new AnalysisError("service", "The TypeSafe Jev model is unavailable through this Gateway account.");
  if (error.statusCode >= 500) return new AnalysisError("service", "Vercel AI Gateway or TypeSafe is temporarily unavailable.");
  return new AnalysisError("service", `Vercel AI Gateway rejected the request with status ${error.statusCode}.`);
}

type Question = EvaluationQuestion & (
  | Readonly<{ type: "boolean"; instructions: string; criteria: { true: string; false: string } }>
  | Readonly<{ type: "choice"; instructions: string; criteria: Readonly<Record<string, string>> }>
);

type Answer = EvaluationAnswer<Question>;
type Answers = Readonly<Record<string, Answer>>;
type EvaluationState = string | readonly JSONValue[] | Readonly<Record<string, JSONValue>>;
type ParsedChoice<Label extends string> = Readonly<{
  choice: Label;
  probabilities: Readonly<Record<string, number>> | null;
}>;

function answerFor(answers: Answers, key: string): Answer {
  const answer = answers[key];
  if (!answer) throw new AnalysisError("response-invalid", "The model returned an incomplete answer set.");
  return answer;
}

function parseBoolean(answers: Answers, key: string): boolean {
  const answer = answerFor(answers, key);
  if (answer.type !== "boolean" || !Number.isFinite(answer.probability) || answer.probability < 0 || answer.probability > 1) {
    throw new AnalysisError("response-invalid", "The model returned an invalid Boolean answer.");
  }
  return answer.probability >= 0.5;
}

function hasLabel<Label extends string>(labels: readonly Label[], value: string): value is Label {
  return labels.some((label) => label === value);
}

function parseChoice<Label extends string>(answers: Answers, key: string, labels: readonly Label[]): ParsedChoice<Label> {
  const answer = answerFor(answers, key);
  if (answer.type !== "choice" || typeof answer.choice !== "string" || !hasLabel(labels, answer.choice)) {
    throw new AnalysisError("response-invalid", "The model returned an invalid Choice answer.");
  }
  if (answer.probabilities === undefined) return { choice: answer.choice, probabilities: null };
  const probabilities = answer.probabilities;
  if (probabilities === null || typeof probabilities !== "object" || Array.isArray(probabilities)) {
    throw new AnalysisError("response-invalid", "The model returned invalid Choice probabilities.");
  }
  const keys = Object.keys(probabilities);
  if (keys.length !== labels.length || labels.some((label) => !Object.hasOwn(probabilities, label))) {
    throw new AnalysisError("response-invalid", "The model returned invalid Choice probabilities.");
  }
  let total = 0;
  for (const label of labels) {
    const probability = probabilities[label];
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new AnalysisError("response-invalid", "The model returned invalid Choice probabilities.");
    }
    total += probability;
  }
  if (Math.abs(total - 1) > 0.0001) {
    throw new AnalysisError("response-invalid", "The model returned invalid Choice probabilities.");
  }
  return { choice: answer.choice, probabilities };
}

async function responseText(response: Response): Promise<string> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > LIMITS.responseBytes) throw new AnalysisError("response-too-large", "The AI Gateway response was too large.");
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > LIMITS.responseBytes) throw new AnalysisError("response-too-large", "The AI Gateway response was too large.");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > LIMITS.responseBytes) {
      await reader.cancel();
      throw new AnalysisError("response-too-large", "The AI Gateway response was too large.");
    }
    chunks.push(decoder.decode(part.value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

async function evaluateQuestions(args: Readonly<{
  state: EvaluationState;
  questions: Record<string, Question>;
  apiKey: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
}>): Promise<Answers> {
  const controller = new AbortController();
  const abort = (): void => controller.abort(args.signal.reason);
  if (args.signal.aborted) abort();
  else args.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);
  let boundaryError: AnalysisError | null = null;
  const boundedFetch: typeof fetch = async (input, init) => {
    const response = await args.fetchImpl.call(globalThis, input, init);
    try {
      const text = await responseText(response);
      if (response.status === 403 && text.includes('"customer_verification_required"')) {
        throw new AnalysisError("forbidden", "Vercel requires a valid payment card before AI Gateway can use free credits.");
      }
      return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : text, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      if (error instanceof AnalysisError) boundaryError = error;
      throw error;
    }
  };
  try {
    const gateway = createGateway({ apiKey: args.apiKey, fetch: boundedFetch });
    const result = await evaluate({
      model: gateway.evaluationModel(MODEL_ID),
      state: args.state,
      questions: args.questions,
      abortSignal: controller.signal,
      maxRetries: 0,
    });
    return result.answers;
  } catch (error) {
    if (boundaryError) throw boundaryError;
    if (error instanceof AnalysisError) throw error;
    if (args.signal.aborted) throw error;
    if (controller.signal.aborted) throw new AnalysisError("timeout", "The AI Gateway request timed out.");
    if (InvalidResponseDataError.isInstance(error)) {
      throw new AnalysisError("response-invalid", error.message.includes("probabilities") ? "The model returned invalid Choice probabilities." : "The model returned invalid evaluation data.");
    }
    const gatewayError = gatewayAnalysisError(error);
    if (gatewayError) throw gatewayError;
    throw new AnalysisError("network", "The AI Gateway request failed. Check the session key and try again.");
  } finally {
    clearTimeout(timer);
    args.signal.removeEventListener("abort", abort);
  }
}

function trimmedRange(text: string, start: number, end: number): SourceSpan | null {
  while (start < end && /\s/u.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(text[end - 1] ?? "")) end -= 1;
  if (start >= end) return null;
  return { id: "", text: text.slice(start, end), start, end };
}

function pushChunks(text: string, start: number, end: number, spans: SourceSpan[]): void {
  const candidate = trimmedRange(text, start, end);
  if (!candidate) return;
  if (candidate.text.length <= LIMITS.maxSpanChars) {
    spans.push(candidate);
    return;
  }
  let cursor = candidate.start;
  while (cursor < candidate.end) {
    const limit = Math.min(cursor + LIMITS.maxSpanChars, candidate.end);
    let chunkEnd = limit;
    if (limit < candidate.end) {
      const whitespace = text.lastIndexOf(" ", limit);
      if (whitespace > cursor + 40) chunkEnd = whitespace;
    }
    const chunk = trimmedRange(text, cursor, chunkEnd);
    if (chunk) spans.push(chunk);
    cursor = chunkEnd;
  }
}

export function makeSourceSpans(text: string, prefix: "job" | "resume", maxSpans = LIMITS.maxSpans): readonly SourceSpan[] {
  const spans: SourceSpan[] = [];
  const lines = /[^\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = lines.exec(text)) !== null && spans.length < maxSpans) pushChunks(text, match.index, match.index + match[0].length, spans);
  const unique: SourceSpan[] = [];
  const seen = new Set<string>();
  for (const span of spans) {
    const key = normalizeForComparison(span.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...span, id: `${prefix}-${unique.length}` });
    if (unique.length >= maxSpans) break;
  }
  return unique;
}

async function classifyRequirements(jobSpans: readonly SourceSpan[], apiKey: string, signal: AbortSignal, fetchImpl: typeof fetch): Promise<readonly Requirement[]> {
  const requirements: Requirement[] = [];
  const questions: Record<string, Question> = {};
  for (const [index] of jobSpans.entries()) {
    questions[`requirement_${index}`] = {
      type: "boolean",
      instructions: `Does \`jobSpans[${index}].text\` state a concrete criterion used to evaluate an applicant?`,
      criteria: {
        true: "An explicit required or preferred work history, skill, responsibility, or formal qualification.",
        false: "A heading, company description, benefit, legal or accommodation text, application instruction, contact information, or other non-evaluation text.",
      },
    };
    questions[`importance_${index}`] = {
      type: "choice",
      instructions: `Assuming \`jobSpans[${index}].text\` is a requirement, how does the employer classify it?`,
      criteria: {
        required: "Explicitly required, minimum, must-have, essential, expected, or a central duty.",
        preferred: "Preferred, desirable, beneficial, a bonus, or optional.",
      },
    };
    questions[`metric_${index}`] = {
      type: "choice",
      instructions: `Assuming \`jobSpans[${index}].text\` is a requirement, which single fit metric owns it?`,
      criteria: {
        experience: "Prior work history, duration, recency, seniority, role family, or prior domain experience.",
        skillset: "Tools, technologies, methods, professional knowledge, languages, or demonstrated competencies. Domain knowledge belongs here.",
        responsibility: "Required ownership, leadership, activities, decisions, deliverables, scope, or outcomes.",
        qualification: "Degree, certification, license, work authorization, clearance, or another formal credential.",
      },
    };
  }
  const answers = await evaluateQuestions({ state: { jobSpans: jobSpans.map((span) => ({ id: span.id, text: span.text })) }, questions, apiKey, signal, fetchImpl });
  for (const [index, span] of jobSpans.entries()) {
    const importance = parseChoice(answers, `importance_${index}`, ["required", "preferred"]);
    const metric = parseChoice(answers, `metric_${index}`, FIT_METRICS.map((item) => item.metric));
    if (!parseBoolean(answers, `requirement_${index}`)) continue;
    requirements.push({ metric: metric.choice, importance: importance.choice, requirement: span });
  }
  return requirements;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "application", "apply", "are", "as", "at", "be", "benefits", "by", "candidate", "company", "contact", "email", "equal", "experience", "for", "from", "in", "information", "is", "it", "job", "legal", "minimum", "name", "of", "on", "opportunity", "or", "our", "phone", "position", "preferred", "qualification", "qualifications", "required", "requirement", "requirements", "resume", "role", "skills", "team", "the", "this", "to", "we", "with", "work", "years", "year", "you", "your",
]);

function tokens(value: string): Set<string> {
  return new Set(normalizeForComparison(value).split(/[^a-z0-9+#.]+/u).filter((token) => (token.length >= 2 || token === "r") && !STOP_WORDS.has(token)));
}

function shortlist(requirement: SourceSpan, resumeSpans: readonly SourceSpan[]): readonly SourceSpan[] {
  const wanted = tokens(requirement.text);
  if (wanted.size === 0) return [];
  const ranked = resumeSpans.map((span, index) => {
    let score = 0;
    for (const token of tokens(span.text)) if (wanted.has(token)) score += 1;
    return { span, score, index };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, 5).map((entry) => entry.span);
}

type EvidenceChoice = "no_match" | "related_only" | "partial_match" | "clear_match";
type CandidateMatch = Readonly<{
  alignment: Alignment;
  probability: number;
  resume: SourceSpan;
  order: number;
}>;
type JobEvidence = Readonly<{
  requirement: Requirement;
  candidates: readonly SourceSpan[];
  matches: CandidateMatch[];
}>;
type Pair = Readonly<{
  key: string;
  job: JobEvidence;
  resume: SourceSpan;
  order: number;
}>;

const EVIDENCE_CHOICES = ["no_match", "related_only", "partial_match", "clear_match"] as const;

function choiceProbability(answer: ParsedChoice<EvidenceChoice>, label: EvidenceChoice): number {
  return answer.probabilities?.[label] ?? 0;
}

function evidenceMatch(answer: ParsedChoice<EvidenceChoice>): Readonly<{ alignment: Alignment; probability: number }> {
  if (answer.choice === "no_match") return { alignment: "no-match", probability: 0 };
  if (answer.choice === "related_only") return { alignment: "related", probability: choiceProbability(answer, "related_only") };
  if (!answer.probabilities) return { alignment: "no-match", probability: 0 };
  const clear = choiceProbability(answer, "clear_match");
  if (clear >= 0.7) return { alignment: "clear", probability: clear };
  const partial = choiceProbability(answer, "partial_match");
  if (partial + clear >= 0.7) return { alignment: "partial", probability: partial + clear };
  return { alignment: "no-match", probability: 0 };
}

function alignmentRank(alignment: Alignment): number {
  if (alignment === "clear") return 3;
  if (alignment === "partial") return 2;
  if (alignment === "related") return 1;
  return 0;
}

function betterMatch(candidate: CandidateMatch, current: CandidateMatch): boolean {
  const candidateRank = alignmentRank(candidate.alignment);
  const currentRank = alignmentRank(current.alignment);
  if (candidateRank !== currentRank) return candidateRank > currentRank;
  if (candidate.probability !== current.probability) return candidate.probability > current.probability;
  return candidate.order < current.order;
}

function selectMatch(matches: readonly CandidateMatch[]): CandidateMatch | null {
  let selected: CandidateMatch | null = null;
  for (const candidate of matches) {
    if (!selected || betterMatch(candidate, selected)) selected = candidate;
  }
  return selected;
}

function yearCounts(value: string): number[] {
  return Array.from(value.matchAll(/\b(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/giu), (match) => Number(match[1]))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
}

function supportsYearThresholds(requirement: string, resumeEvidence: string): boolean {
  const required = yearCounts(requirement);
  if (required.length === 0) return true;
  const demonstrated = yearCounts(resumeEvidence);
  return demonstrated.length >= required.length && required.every((years, index) => (demonstrated[index] ?? 0) >= years);
}

async function scoreEvidence(requirements: readonly Requirement[], resumeSpans: readonly SourceSpan[], apiKey: string, signal: AbortSignal, fetchImpl: typeof fetch): Promise<readonly RequirementEvidence[]> {
  const jobs: JobEvidence[] = requirements.map((requirement) => ({ requirement, candidates: shortlist(requirement.requirement, resumeSpans), matches: [] }));
  const questions: Record<string, Question> = {};
  const pairs: Pair[] = [];
  for (const [jobIndex, job] of jobs.entries()) {
    for (const [candidateIndex, resume] of job.candidates.entries()) {
      const key = `match_${jobIndex}_${candidateIndex}`;
      questions[key] = {
        type: "choice",
        instructions: `Which evidence relationship exists between \`pairs[${pairs.length}].resumeEvidence\` and \`pairs[${pairs.length}].jobRequirement\`? Use only facts explicitly stated in the supplied resume evidence. Do not infer competence from a job title, employer, school, industry, or shared keywords. A listed skill without demonstrated use is at most a partial match. Shared terminology alone is not evidence. Choose clear_match only when every material condition is explicitly supported.`,
        criteria: {
          no_match: "No direct support. The text is unrelated, a heading or contact detail, or shares keywords without demonstrated experience.",
          related_only: "Adjacent or transferable experience, but the requirement itself is not demonstrated.",
          partial_match: "The evidence directly demonstrates part of the requirement, but material scope, depth, recency, seniority, credential, or capability is unsupported.",
          clear_match: "The evidence explicitly demonstrates every material part of the requirement at the requested or greater level.",
        },
      };
      pairs.push({ key, job, resume, order: candidateIndex });
    }
  }
  if (pairs.length > 0) {
    const answers = await evaluateQuestions({ state: { pairs: pairs.map((pair) => ({ jobRequirement: pair.job.requirement.requirement.text, resumeEvidence: pair.resume.text })) }, questions, apiKey, signal, fetchImpl });
    for (const pair of pairs) {
      const modelDecision = evidenceMatch(parseChoice(answers, pair.key, EVIDENCE_CHOICES));
      const decision: Readonly<{ alignment: Alignment; probability: number }> = modelDecision.alignment === "clear" && !supportsYearThresholds(pair.job.requirement.requirement.text, pair.resume.text)
        ? { alignment: "partial", probability: modelDecision.probability }
        : modelDecision;
      pair.job.matches.push({ ...decision, resume: pair.resume, order: pair.order });
    }
  }
  return jobs.map((job): RequirementEvidence => {
    const selected = selectMatch(job.matches);
    if (!selected || selected.alignment === "no-match") {
      return { metric: job.requirement.metric, importance: job.requirement.importance, alignment: "no-match", requirement: job.requirement.requirement, resumeEvidence: null };
    }
    return { metric: job.requirement.metric, importance: job.requirement.importance, alignment: selected.alignment, requirement: job.requirement.requirement, resumeEvidence: selected.resume };
  });
}

function validSpan(text: string, span: SourceSpan): boolean {
  return Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= text.length && text.slice(span.start, span.end) === span.text;
}

function isFitMetric(value: unknown): value is FitMetric {
  return typeof value === "string" && FIT_METRICS.some((metric) => metric.metric === value);
}

function isRequirementImportance(value: unknown): value is RequirementImportance {
  return value === "required" || value === "preferred";
}

function isAlignment(value: unknown): value is Alignment {
  return value === "clear" || value === "partial" || value === "related" || value === "no-match";
}

function validateEvidence(jobText: string, resumeText: string, evidence: readonly RequirementEvidence[]): void {
  const seen = new Set<string>();
  for (const item of evidence) {
    if (!isFitMetric(item.metric)) throw new AnalysisError("response-invalid", "The report contains an invalid fit metric.");
    if (!isRequirementImportance(item.importance)) throw new AnalysisError("response-invalid", "The report contains an invalid requirement importance.");
    if (!isAlignment(item.alignment)) throw new AnalysisError("response-invalid", "The report contains an invalid evidence match.");
    if (!validSpan(jobText, item.requirement)) throw new AnalysisError("response-invalid", "The report contains an invalid job span.");
    const requirementKey = normalizeForComparison(item.requirement.text);
    if (!requirementKey || seen.has(requirementKey)) throw new AnalysisError("response-invalid", "The report contains duplicate requirements.");
    seen.add(requirementKey);
    if (item.alignment === "no-match") {
      if (item.resumeEvidence !== null) throw new AnalysisError("response-invalid", "No-match evidence cannot include a resume span.");
    } else if (!item.resumeEvidence || !validSpan(resumeText, item.resumeEvidence)) {
      throw new AnalysisError("response-invalid", "The report contains invalid resume evidence.");
    }
  }
}

function importanceWeight(importance: RequirementImportance): number {
  return importance === "required" ? 2 : 1;
}

function matchCredit(alignment: Alignment): number {
  if (alignment === "clear") return 1;
  if (alignment === "partial") return 0.5;
  return 0;
}

function emptyCoverage(): { clear: number; partial: number; related: number; noMatch: number } {
  return { clear: 0, partial: 0, related: 0, noMatch: 0 };
}

function addCoverage(coverage: { clear: number; partial: number; related: number; noMatch: number }, alignment: Alignment): void {
  if (alignment === "clear") coverage.clear += 1;
  else if (alignment === "partial") coverage.partial += 1;
  else if (alignment === "related") coverage.related += 1;
  else coverage.noMatch += 1;
}

function boundedPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreMetric(policy: (typeof FIT_METRICS)[number], evidence: readonly RequirementEvidence[]): FitMetricResult {
  const requirements = evidence.filter((item) => item.metric === policy.metric);
  if (requirements.length === 0) {
    return { kind: "not-applicable", metric: policy.metric, label: policy.label, weight: policy.weight };
  }
  const coverage = emptyCoverage();
  let available = 0;
  let earned = 0;
  for (const item of requirements) {
    const weight = importanceWeight(item.importance);
    available += weight;
    earned += weight * matchCredit(item.alignment);
    addCoverage(coverage, item.alignment);
  }
  return {
    kind: "scored",
    metric: policy.metric,
    label: policy.label,
    weight: policy.weight,
    score: boundedPercent((earned / available) * 100),
    coverage,
  };
}

function scoreOverall(metrics: FitMetricResults): number {
  let denominator = 0;
  let numerator = 0;
  for (const metric of metrics) {
    if (metric.kind === "not-applicable") continue;
    denominator += metric.weight;
    numerator += metric.score * metric.weight;
  }
  return denominator === 0 ? 0 : boundedPercent(numerator / denominator);
}

function qualificationBlockers(evidence: readonly RequirementEvidence[]): readonly QualificationBlocker[] {
  return evidence.flatMap((item) => {
    if (item.metric !== "qualification" || item.importance !== "required" || item.alignment === "clear") return [];
    return [{ requirement: item.requirement }];
  });
}

export function buildFitReport(args: Readonly<{ snapshot: AnalysisSnapshot; jobText: string; resumeText: string; evidence: readonly RequirementEvidence[] }>): FitReport {
  validateEvidence(args.jobText, args.resumeText, args.evidence);
  if (args.evidence.length === 0) return { kind: "insufficient-job-requirements", snapshot: args.snapshot };
  const metrics: FitMetricResults = [
    scoreMetric(FIT_METRICS[0], args.evidence),
    scoreMetric(FIT_METRICS[1], args.evidence),
    scoreMetric(FIT_METRICS[2], args.evidence),
    scoreMetric(FIT_METRICS[3], args.evidence),
  ];
  return {
    kind: "scored",
    snapshot: args.snapshot,
    score: scoreOverall(metrics),
    metrics,
    blockers: qualificationBlockers(args.evidence),
    evidence: args.evidence,
  };
}

export type AnalyzeFitArgs = Readonly<{
  apiKey: string;
  snapshot: AnalysisSnapshot;
  resumeText: string;
  jobText: string;
  signal: AbortSignal;
  onPhase?: (phase: AnalysisPhase) => void;
  fetchImpl?: typeof fetch;
}>;

export async function analyzeFit(args: AnalyzeFitArgs): Promise<FitReport> {
  if (!args.apiKey.trim() || !args.resumeText.trim() || !args.jobText.trim()) throw new AnalysisError("insufficient-input", "Resume, confirmed job text, and API key are required.");
  const fetchImpl = args.fetchImpl ?? fetch;
  const jobSpans = makeSourceSpans(args.jobText, "job");
  const resumeSpans = makeSourceSpans(args.resumeText, "resume");
  args.onPhase?.("finding-requirements");
  const requirements = await classifyRequirements(jobSpans, args.apiKey, args.signal, fetchImpl);
  if (requirements.length === 0) return { kind: "insufficient-job-requirements", snapshot: args.snapshot };
  args.onPhase?.("matching-resume");
  const evidence = await scoreEvidence(requirements, resumeSpans, args.apiKey, args.signal, fetchImpl);
  return buildFitReport({ snapshot: args.snapshot, jobText: args.jobText, resumeText: args.resumeText, evidence });
}
