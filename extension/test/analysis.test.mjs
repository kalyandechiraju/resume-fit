import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const [{ text: moduleText }] = (await build({
  bundle: true,
  entryPoints: [new URL("../src/analysis.ts", import.meta.url).pathname],
  format: "esm",
  platform: "browser",
  write: false,
})).outputFiles;

const { analyzeFit, buildFitReport, makeSourceSpans } = await import(`data:text/javascript;base64,${Buffer.from(moduleText).toString("base64")}`);

test("exact evidence produces deterministic metric and overall scores", () => {
  const jobText = "Build accessible interfaces\nLead product discovery";
  const resumeText = "Built accessible interfaces for three products\nLed discovery with customers";
  const [accessibility, discovery] = makeSourceSpans(jobText);
  const [built, led] = makeSourceSpans(resumeText);

  const report = buildFitReport({
    jobText,
    resumeText,
    evidence: [
      { metric: "skillset", importance: "required", alignment: "clear", requirement: accessibility, resumeEvidence: built },
      { metric: "responsibility", importance: "preferred", alignment: "partial", requirement: discovery, resumeEvidence: led },
    ],
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 77);
  assert.equal(report.metrics[1].score, 100);
  assert.equal(report.metrics[2].score, 50);
});

test("report builder rejects evidence outside the source text", () => {
  assert.throws(() => buildFitReport({
    jobText: "Build accessible interfaces",
    resumeText: "Built a design system",
    evidence: [{
      metric: "skillset",
      importance: "required",
      alignment: "clear",
      requirement: { text: "Build accessible interfaces", start: 0, end: 27 },
      resumeEvidence: { text: "Invented evidence", start: 0, end: 17 },
    }],
  }), /invalid resume evidence/);
});

test("AI SDK sends typed Jev evaluations through Vercel AI Gateway", async () => {
  const { fetchImpl, requests } = strictGatewayFetch();
  const phases = [];
  const report = await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces",
    jobText: "Build accessible interfaces",
    signal: new AbortController().signal,
    fetchImpl,
    onPhase: (phase) => phases.push(phase),
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 100);
  assert.equal(requests.length, 2);
  assert.deepEqual(phases, ["finding-requirements", "matching-resume"]);
  for (const request of requests) {
    assert.equal(request.url, "https://ai-gateway.vercel.sh/v4/ai/evaluation-model");
    assert.equal(request.headers.get("authorization"), "Bearer vck_placeholder_for_tests");
    assert.equal(request.headers.get("ai-model-id"), "typesafe-ai/jev");
  }
});

test("Gateway authentication failures remain actionable", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    error: { message: "Invalid API key", type: "authentication_error" },
  }), { status: 401, headers: { "content-type": "application/json" } });

  await assert.rejects(analyzeFit({
    apiKey: "vck_invalid_for_test",
    resumeText: "Built accessible interfaces",
    jobText: "Build accessible interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  }), (error) => {
    assert.equal(error.code, "authentication");
    assert.match(error.message, /rejected the Gateway key/);
    return true;
  });
});

test("Gateway customer verification failures remain actionable", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    error: { message: "AI Gateway requires a valid credit card on file to service requests.", type: "customer_verification_required" },
  }), { status: 403, headers: { "content-type": "application/json" } });

  await assert.rejects(analyzeFit({
    apiKey: "vck_valid_for_test",
    resumeText: "Built accessible interfaces",
    jobText: "Build accessible interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  }), (error) => {
    assert.equal(error.code, "forbidden");
    assert.match(error.message, /valid payment card/);
    return true;
  });
});

test("large analyses use two Gateway requests", async () => {
  const { fetchImpl, requests } = strictGatewayFetch();

  await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces",
    jobText: Array.from({ length: 64 }, (_, index) => `Use TypeScript requirement ${index}`).join("\n"),
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(requests.length, 2);
});

function strictChoice(choice, probabilities) {
  return probabilities === undefined
    ? { type: "choice", choice }
    : { type: "choice", choice, probabilities };
}

function strictMetricProbabilities(metric = "skillset") {
  return Object.fromEntries([
    "experience",
    "skillset",
    "responsibility",
    "qualification",
  ].map((label) => [label, label === metric ? 0.97 : 0.01]));
}

function strictEvidenceProbabilities(overrides = {}) {
  return {
    no_match: 0.05,
    related_only: 0.05,
    partial_match: 0.1,
    clear_match: 0.8,
    ...overrides,
  };
}

function strictGatewayFetch(options = {}) {
  const requests = [];
  const fetchImpl = async function (input, init) {
    assert.equal(this, globalThis);
    const body = JSON.parse(init.body);
    const headers = new Headers(init.headers);
    requests.push({ url: String(input), body, headers });
    const answers = Object.fromEntries(Object.entries(body.questions).map(([key, question]) => {
      if (question.type === "boolean") return [key, { type: "boolean", probability: options.requirementProbability ?? 0.99 }];
      if (key.startsWith("importance_")) return [key, strictChoice("required", { required: 0.99, preferred: 0.01 })];
      if (key.startsWith("metric_")) return [key, strictChoice(options.metric ?? "skillset", strictMetricProbabilities(options.metric))];
      if (key.startsWith("match_")) return [key, strictChoice(options.evidenceChoice ?? "clear_match", Object.hasOwn(options, "probabilities") ? options.probabilities : strictEvidenceProbabilities())];
      throw new Error(`Unexpected question ${key} of type ${question.type}`);
    }));
    return new Response(JSON.stringify({ answers }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, requests };
}

function singleStrictEvidence({
  metric = "skillset",
  importance = "required",
  alignment = "clear",
  jobText = "Use TypeScript for product interfaces",
  resumeText = "Built TypeScript interfaces for customers",
} = {}) {
  const [requirement] = makeSourceSpans(jobText);
  const [resumeEvidence] = makeSourceSpans(resumeText);
  return {
    jobText,
    resumeText,
    evidence: [{
      metric,
      importance,
      alignment,
      requirement,
      resumeEvidence: alignment === "no-match" ? null : resumeEvidence,
    }],
  };
}

test("fixed metrics are presentation-ready and ordered", () => {
  const jobText = [
    "Five years of product management experience",
    "Use SQL and Python for product analysis",
    "Own roadmap delivery across teams",
    "MBA required",
  ].join("\n");
  const resumeText = [
    "Product manager for five years",
    "Built SQL and Python reporting",
    "Owned roadmap delivery across product teams",
    "MBA, Example University",
  ].join("\n");
  const requirements = makeSourceSpans(jobText);
  const resumes = makeSourceSpans(resumeText);
  const report = buildFitReport({
    jobText,
    resumeText,
    evidence: [
      { metric: "experience", importance: "required", alignment: "clear", requirement: requirements[0], resumeEvidence: resumes[0] },
      { metric: "skillset", importance: "required", alignment: "clear", requirement: requirements[1], resumeEvidence: resumes[1] },
      { metric: "responsibility", importance: "required", alignment: "clear", requirement: requirements[2], resumeEvidence: resumes[2] },
      { metric: "qualification", importance: "required", alignment: "clear", requirement: requirements[3], resumeEvidence: resumes[3] },
    ],
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 100);
  assert.deepEqual(report.metrics.map((metric) => metric.metric), ["experience", "skillset", "responsibility", "qualification"]);
  assert.deepEqual(report.metrics.map((metric) => metric.weight), [30, 30, 25, 15]);
  assert.deepEqual(report.metrics.map((metric) => metric.score), [100, 100, 100, 100]);
});

test("related evidence earns zero", () => {
  const args = singleStrictEvidence({ alignment: "related" });
  const report = buildFitReport(args);

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 0);
  assert.equal(report.metrics[1].kind, "scored");
  assert.equal(report.metrics[1].score, 0);
});

test("not-applicable metrics are excluded from the overall denominator", () => {
  const jobText = ["Five years of product management", "Use SQL", "Own roadmap delivery"].join("\n");
  const resumeText = ["Five years product management", "Used SQL", "No roadmap experience"].join("\n");
  const requirements = makeSourceSpans(jobText);
  const resumes = makeSourceSpans(resumeText);
  const report = buildFitReport({
    jobText,
    resumeText,
    evidence: [
      { metric: "experience", importance: "required", alignment: "clear", requirement: requirements[0], resumeEvidence: resumes[0] },
      { metric: "skillset", importance: "required", alignment: "clear", requirement: requirements[1], resumeEvidence: resumes[1] },
      { metric: "responsibility", importance: "required", alignment: "no-match", requirement: requirements[2], resumeEvidence: null },
    ],
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 71);
  assert.equal(report.metrics[3].kind, "not-applicable");
});

test("clear evidence at the .70 threshold earns full credit", async () => {
  const { fetchImpl } = strictGatewayFetch({ probabilities: strictEvidenceProbabilities({ no_match: 0.1, related_only: 0.1, partial_match: 0.1, clear_match: 0.7 }) });
  const report = await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces for customers",
    jobText: "Use TypeScript for product interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 100);
});

test("clear evidence at .69 earns only partial credit", async () => {
  const { fetchImpl } = strictGatewayFetch({ probabilities: strictEvidenceProbabilities({ no_match: 0.1, related_only: 0.1, partial_match: 0.11, clear_match: 0.69 }) });
  const report = await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces for customers",
    jobText: "Use TypeScript for product interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 50);
});

test("explicit year thresholds are compared in code", async () => {
  const { fetchImpl } = strictGatewayFetch();
  const report = await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Used TypeScript in product development for 5 years",
    jobText: "8 years of TypeScript product development experience",
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 50);
});

test("missing evidence probabilities fail closed without displaying an excerpt", async () => {
  const { fetchImpl } = strictGatewayFetch({ evidenceChoice: "clear_match", probabilities: undefined });
  const report = await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces for customers",
    jobText: "Use TypeScript for product interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 0);
});

test("low-confidence supportive evidence fails closed instead of fabricating related evidence", async () => {
  const { fetchImpl } = strictGatewayFetch({
    evidenceChoice: "partial_match",
    probabilities: { no_match: 0.35, related_only: 0, partial_match: 0.4, clear_match: 0.25 },
  });
  const report = await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces for customers",
    jobText: "Use TypeScript for product interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(report.kind, "scored");
  assert.equal(report.score, 0);
});

test("malformed Choice probability maps fail at the response boundary", async () => {
  const { fetchImpl } = strictGatewayFetch({ probabilities: { no_match: 0.2, related_only: 0.2, partial_match: 0.6 } });

  await assert.rejects(analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces for customers",
    jobText: "Use TypeScript for product interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  }), (error) => {
    assert.equal(error.code, "response-invalid");
    assert.match(error.message, /invalid Choice probabilities/);
    return true;
  });
});

test("zero substantive overlap asks no evidence question and returns no match", async () => {
  const { fetchImpl, requests } = strictGatewayFetch();
  const report = await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "JANE DOE\njane@example.com\nEXPERIENCE",
    jobText: "Product Manager",
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(report.kind, "scored");
  assert.equal(requests.length, 1);
  assert.equal(report.score, 0);
});

test("Gateway requests use Choice for strict evidence evaluation", async () => {
  const { fetchImpl, requests } = strictGatewayFetch();
  await analyzeFit({
    apiKey: "vck_placeholder_for_tests",
    resumeText: "Built TypeScript interfaces for customers",
    jobText: "Use TypeScript for product interfaces",
    signal: new AbortController().signal,
    fetchImpl,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://ai-gateway.vercel.sh/v4/ai/evaluation-model");
  assert.equal(requests[0].headers.get("authorization"), "Bearer vck_placeholder_for_tests");
  assert.equal(requests[0].headers.get("ai-model-id"), "typesafe-ai/jev");
  assert.ok(requests.every((request) => Object.values(request.body.questions).every((question) => question.type !== "score")));
  assert.match(JSON.stringify(requests[0].body.questions), /accommodation/);
  assert.match(JSON.stringify(requests[0].body.questions), /qualification/);
  assert.ok(Object.values(requests[1].body.questions).every((question) => question.type === "choice"));
  assert.match(JSON.stringify(requests[1].body.questions), /no_match/);
  assert.doesNotMatch(JSON.stringify(requests[1].body.questions), /"score"/);
});

test("report builder rejects arbitrary evidence for no match", () => {
  const jobText = "Product Manager";
  const resumeText = "JANE DOE\njane@example.com";
  const [requirement] = makeSourceSpans(jobText);
  const [contact] = makeSourceSpans(resumeText);

  assert.throws(() => buildFitReport({
    jobText,
    resumeText,
    evidence: [{
      metric: "experience",
      importance: "required",
      alignment: "no-match",
      requirement,
      resumeEvidence: contact,
    }],
  }), /No-match evidence cannot include a resume span/);
});
