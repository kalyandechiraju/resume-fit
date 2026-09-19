import {
  analysisSnapshot, normalizeText, newOpaqueVersion, snapshotForInputs,
  type AssessmentInputs, type FitMetricResult, type FitReport, type InputSnapshot,
} from "./domain";
import { analyzeFit, AnalysisError, type AnalysisPhase } from "./analysis";
import {
  consumeLatestCapture, deleteApiKey, deleteJob, deleteResume, loadAssessment,
  saveApiKey, saveJobConfirmed, saveResume, type StorageAreas,
} from "./storage";
import { parseResume, ResumeParseError } from "./resume";

export type PanelState =
  | Readonly<{ kind: "onboarding-resume"; inputs: InputSnapshot; error: string | null }>
  | Readonly<{ kind: "parsing-resume"; inputs: InputSnapshot; fileName: string; returnTo: "onboarding" | "settings" }>
  | Readonly<{ kind: "onboarding-key"; inputs: InputSnapshot; error: string | null }>
  | Readonly<{ kind: "waiting-job"; inputs: InputSnapshot; notice: string | null }>
  | Readonly<{ kind: "job-ready"; inputs: InputSnapshot; notice: string | null }>
  | Readonly<{ kind: "capture-error"; inputs: InputSnapshot; message: string }>
  | Readonly<{ kind: "analyzing"; inputs: InputSnapshot; phase: AnalysisPhase }>
  | Readonly<{ kind: "report"; inputs: InputSnapshot; report: FitReport }>
  | Readonly<{ kind: "analysis-error"; inputs: InputSnapshot; message: string }>
  | Readonly<{ kind: "settings"; inputs: InputSnapshot; notice: string | null; error: string | null }>;

function normalState(inputs: AssessmentInputs, notice: string | null = null): PanelState {
  const snapshot = snapshotForInputs(inputs);
  if (!inputs.resume) return { kind: "onboarding-resume", inputs: snapshot, error: null };
  if (!inputs.apiKey) return { kind: "onboarding-key", inputs: snapshot, error: null };
  return inputs.job ? { kind: "job-ready", inputs: snapshot, notice } : { kind: "waiting-job", inputs: snapshot, notice };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(text: string, action: string, className = ""): HTMLButtonElement {
  const node = element("button", text);
  node.type = "button";
  node.dataset.action = action;
  node.className = className;
  return node;
}

function screenHeader(eyebrow: string, title: string, copy: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const label = element("p", eyebrow);
  label.className = "eyebrow";
  const heading = element("h2", title);
  heading.className = "screen-title";
  const intro = element("p", copy);
  intro.className = "intro";
  fragment.append(label, heading, intro);
  return fragment;
}

function workflowIllustration(name: "resume" | "job" | "results"): HTMLImageElement {
  const image = element("img");
  image.className = `workflow-illustration illustration-${name}`;
  image.src = `../assets/illustration-${name}.png`;
  image.alt = "";
  image.width = 768;
  image.height = 512;
  image.decoding = "async";
  image.fetchPriority = "high";
  return image;
}

function message(text: string, kind: "notice" | "error" = "notice"): HTMLParagraphElement {
  const node = element("p", text);
  node.className = kind;
  if (kind === "error") node.setAttribute("role", "alert");
  return node;
}

function resumePicker(labelText: string): HTMLElement {
  const label = element("label");
  label.className = "file-picker";
  const copy = element("span", labelText);
  copy.className = "button-copy";
  const picker = element("input");
  picker.type = "file";
  picker.accept = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  picker.id = "resume-file";
  label.append(copy, picker);
  return label;
}

function metadataRow(label: string, value: string): HTMLElement {
  const row = element("div");
  row.className = "metadata-row";
  row.append(element("span", label), element("strong", value));
  return row;
}

function sourceName(url: string | null): string {
  if (!url) return "Pasted job description";
  try { return new URL(url).hostname.replace(/^www\./u, ""); } catch { return "Captured job page"; }
}

function renderResumeOnboarding(parent: HTMLElement, state: Extract<PanelState, { kind: "onboarding-resume" }>): void {
  parent.append(screenHeader("Step 1 of 2", "Add your resume", "We extract the text locally. Your original file never leaves this browser."));
  parent.append(workflowIllustration("resume"));
  if (state.error) parent.append(message(state.error, "error"));
  const card = element("section");
  card.className = "upload-card";
  const mark = element("span", "↑");
  mark.className = "upload-mark";
  mark.setAttribute("aria-hidden", "true");
  card.append(mark, element("h3", "Choose a resume"), element("p", "PDF or DOCX, up to 5 MB"), resumePicker("Choose file"));
  parent.append(card, element("p", "You can replace or delete it later in Settings."));
}

function renderKeyOnboarding(parent: HTMLElement, state: Extract<PanelState, { kind: "onboarding-key" }>): void {
  parent.append(screenHeader("Step 2 of 2", "Connect AI Gateway", "Resume Fit uses TypeSafe Jev through Vercel AI Gateway to compare your documents."));
  if (state.error) parent.append(message(state.error, "error"));
  const card = element("section");
  card.className = "card form-card";
  const label = element("label", "Vercel AI Gateway key");
  label.htmlFor = "api-key";
  const key = element("input");
  key.type = "password";
  key.id = "api-key";
  key.autocomplete = "off";
  key.maxLength = 512;
  key.placeholder = "vck_…";
  const hint = element("p", "Saved only for this Chrome session. Closing Chrome clears it.");
  hint.className = "hint";
  card.append(label, key, hint, actionButton("Save and continue", "save-api-key"));
  parent.append(card);
}

function renderWaiting(parent: HTMLElement, state: Extract<PanelState, { kind: "waiting-job" }>): void {
  parent.append(screenHeader("Ready to compare", "Choose a job page", "Resume Fit reads the current public job page when you click its toolbar icon."));
  parent.append(workflowIllustration("job"));
  if (state.notice) parent.append(message(state.notice));
  const steps = element("ol");
  steps.className = "steps";
  for (const [title, copy] of [
    ["Open a job listing", "Go to the full job page in this Chrome window."],
    ["Click Resume Fit", "Use the extension icon in the Chrome toolbar."],
    ["Review the title", "Return here to start the comparison."],
  ]) {
    const item = element("li");
    item.append(element("strong", title), element("span", copy));
    steps.append(item);
  }
  const ready = element("section");
  ready.className = "readiness";
  ready.append(metadataRow("Resume", state.inputs.resume?.fileName ?? "Missing"), metadataRow("AI Gateway", "Connected for this session"));
  parent.append(steps, ready);
}

function renderJobReady(parent: HTMLElement, state: Extract<PanelState, { kind: "job-ready" }>): void {
  const job = state.inputs.job;
  if (!job) return;
  parent.append(screenHeader("Job found", "Ready to analyze", "Check the job title, then compare it with your saved resume."));
  parent.append(workflowIllustration("job"));
  if (state.notice) parent.append(message(state.notice));
  const card = element("section");
  card.className = "job-card";
  const icon = element("span", "✓");
  icon.className = "job-check";
  icon.setAttribute("aria-hidden", "true");
  const copy = element("div");
  copy.append(element("p", sourceName(job.url)), element("h3", job.title || "Captured job"));
  card.append(icon, copy);
  const actions = element("div");
  actions.className = "stacked-actions";
  actions.append(actionButton("Analyze match", "analyze"), actionButton("Choose another job", "clear-job", "secondary"));
  parent.append(card, actions, element("p", "The job text is sent only when you analyze. Resume Fit does not predict hiring decisions."));
}

function renderCaptureError(parent: HTMLElement, state: Extract<PanelState, { kind: "capture-error" }>): void {
  parent.append(screenHeader("Job not found", "We could not read this page", "Some job sites block extensions or hide the description."), message(state.message, "error"));
  const details = element("details");
  details.className = "manual-entry";
  details.open = true;
  details.append(element("summary", "Paste the job description instead"));
  const label = element("label", "Job description");
  label.htmlFor = "job-text";
  const textarea = element("textarea");
  textarea.id = "job-text";
  textarea.rows = 10;
  textarea.maxLength = 50_000;
  textarea.placeholder = "Paste the full job description";
  details.append(label, textarea, actionButton("Use this job", "save-pasted-job"));
  parent.append(details, actionButton("Try another page", "clear-job", "secondary"));
}

function renderAnalyzing(parent: HTMLElement, state: Extract<PanelState, { kind: "analyzing" }>): void {
  const matching = state.phase === "matching-resume";
  parent.append(screenHeader("Analyzing", matching ? "Matching your resume" : "Finding requirements", matching ? "Jev is checking your resume evidence against each requirement." : "Jev is separating concrete requirements from the rest of the page."));
  const progress = element("progress");
  progress.max = 2;
  progress.value = matching ? 2 : 1;
  progress.setAttribute("aria-label", matching ? "Step 2 of 2" : "Step 1 of 2");
  const stages = element("div");
  stages.className = "analysis-stages";
  stages.append(metadataRow("1", "Find requirements"), metadataRow("2", "Match resume evidence"));
  parent.append(progress, stages, actionButton("Cancel", "cancel-analysis", "secondary"));
}

function scoreRing(score: number): HTMLElement {
  const wrapper = element("div");
  wrapper.className = "score-ring";
  wrapper.style.setProperty("--score", String(score));
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.append(element("strong", String(score)));
  return wrapper;
}

function renderMetricCard(metric: FitMetricResult): HTMLElement {
  const card = element("section");
  card.className = "metric-card";
  card.append(element("h3", metric.label));
  if (metric.kind === "not-applicable") {
    const value = element("p", "Not specified");
    value.className = "metric-not-applicable";
    card.append(value);
    return card;
  }
  const value = element("strong", `${metric.score}%`);
  value.className = "metric-score";
  const progress = element("progress");
  progress.max = 100;
  progress.value = metric.score;
  progress.setAttribute("aria-label", `${metric.label} ${metric.score} out of 100`);
  card.append(value, progress);
  return card;
}

function renderReport(parent: HTMLElement, state: Extract<PanelState, { kind: "report" }>): void {
  const job = state.inputs.job;
  parent.append(screenHeader(sourceName(job?.url ?? null), job?.title || "Job match", "Document evidence only. This is not a hiring prediction."));
  if (state.report.kind === "insufficient-job-requirements") {
    parent.append(message("The page did not contain enough concrete requirements to score.", "error"), actionButton("Analyze another job", "restart"));
    return;
  }
  parent.append(workflowIllustration("results"));
  const score = element("section");
  score.className = "score-card";
  const semantic = element("progress");
  semantic.className = "visually-hidden";
  semantic.max = 100;
  semantic.value = state.report.score;
  semantic.setAttribute("aria-label", `Overall score ${state.report.score} out of 100`);
  const ring = scoreRing(state.report.score);
  ring.append(element("span", "/100"));
  const scoreLabel = element("p", "Overall match");
  scoreLabel.className = "score-label";
  score.append(semantic, ring, scoreLabel);
  const metrics = element("section");
  metrics.className = "metric-grid";
  metrics.setAttribute("aria-label", "Match metrics");
  for (const metric of state.report.metrics) metrics.append(renderMetricCard(metric));
  parent.append(score, metrics);
  parent.append(actionButton("Analyze another job", "restart"));
}

function renderSettings(parent: HTMLElement, state: Extract<PanelState, { kind: "settings" }>): void {
  parent.append(screenHeader("Settings", "Your data", "Manage what Resume Fit keeps in this browser."));
  if (state.error) parent.append(message(state.error, "error"));
  if (state.notice) parent.append(message(state.notice));
  const resume = element("section");
  resume.className = "card settings-card";
  resume.append(element("h3", "Resume"));
  if (state.inputs.resume) resume.append(metadataRow("Saved file", state.inputs.resume.fileName), resumePicker("Replace resume"), actionButton("Delete resume", "delete-resume", "danger-link"));
  else resume.append(element("p", "No resume saved."), resumePicker("Add resume"));
  const gateway = element("section");
  gateway.className = "card settings-card";
  gateway.append(element("h3", "AI Gateway"), element("p", state.inputs.apiKeyPresent ? "Connected for this Chrome session." : "No session key saved."));
  const label = element("label", state.inputs.apiKeyPresent ? "Replace key" : "Vercel AI Gateway key");
  label.htmlFor = "api-key";
  const key = element("input");
  key.type = "password";
  key.id = "api-key";
  key.autocomplete = "off";
  key.maxLength = 512;
  key.placeholder = "vck_…";
  gateway.append(label, key, actionButton(state.inputs.apiKeyPresent ? "Replace session key" : "Save session key", "save-api-key"));
  if (state.inputs.apiKeyPresent) gateway.append(actionButton("Clear session key", "delete-api-key", "danger-link"));
  parent.append(resume, gateway, actionButton("Back", "close-settings", "secondary"));
}

function renderPanel(root: HTMLElement, state: PanelState): void {
  root.replaceChildren();
  root.dataset.screen = state.kind;
  if (state.kind === "onboarding-resume") renderResumeOnboarding(root, state);
  else if (state.kind === "parsing-resume") {
    const progress = element("progress");
    progress.setAttribute("aria-label", `Reading ${state.fileName}`);
    root.append(screenHeader("Resume", `Reading ${state.fileName}`, "Extracting text locally. This usually takes a few seconds."), progress);
  }
  else if (state.kind === "onboarding-key") renderKeyOnboarding(root, state);
  else if (state.kind === "waiting-job") renderWaiting(root, state);
  else if (state.kind === "job-ready") renderJobReady(root, state);
  else if (state.kind === "capture-error") renderCaptureError(root, state);
  else if (state.kind === "analyzing") renderAnalyzing(root, state);
  else if (state.kind === "report") renderReport(root, state);
  else if (state.kind === "analysis-error") root.append(screenHeader("Analysis stopped", "We could not finish", "Your resume and job are still ready."), message(state.message, "error"), actionButton("Try again", "analyze"), actionButton("Choose another job", "restart", "secondary"));
  else renderSettings(root, state);
}

function errorMessage(error: unknown): string {
  if (error instanceof ResumeParseError || error instanceof AnalysisError) return error.message;
  return "That did not work. Your previous valid data was kept.";
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  const status = document.querySelector<HTMLElement>("#status");
  const settingsButton = document.querySelector<HTMLButtonElement>("#settings-button");
  if (!root || !status || !settingsButton) return;
  const storage: StorageAreas = chrome.storage;
  let assessment = await loadAssessment(storage);
  let report: FitReport | null = null;
  let state: PanelState = normalState(assessment);
  let settingsReturn: "main" | "report" = "main";
  let parseAttemptId: string | null = null;
  let analyzeAttemptId: string | null = null;
  let analyzeController: AbortController | null = null;
  let focusNext = true;

  const repaint = (): void => {
    renderPanel(root, state);
    settingsButton.hidden = !assessment.resume || state.kind === "settings" || state.kind === "onboarding-resume" || state.kind === "onboarding-key";
    settingsButton.setAttribute("aria-expanded", state.kind === "settings" ? "true" : "false");
    if (focusNext) {
      root.querySelector<HTMLElement>("input, textarea, button, summary")?.focus();
      focusNext = false;
    }
  };
  const setState = (next: PanelState, announcement?: string): void => {
    state = next;
    repaint();
    if (announcement) status.textContent = announcement;
  };
  const abortAnalysis = (): void => {
    analyzeAttemptId = null;
    analyzeController?.abort();
    analyzeController = null;
  };
  let captureProcessing = false;
  const applyLatestCapture = async (): Promise<void> => {
    if (captureProcessing) return;
    captureProcessing = true;
    try {
      const capture = await consumeLatestCapture(storage);
      if (capture?.kind === "captured") {
        const job = await saveJobConfirmed(storage, { source: "captured", title: capture.title, url: capture.url, text: capture.text });
        abortAnalysis();
        assessment = { ...assessment, job };
        report = null;
        focusNext = true;
        setState(normalState(assessment, "Job captured from the current tab."), `Job found: ${job.title}`);
      } else if (capture?.kind === "capture-failed" && assessment.resume && assessment.apiKey) {
        focusNext = true;
        setState({ kind: "capture-error", inputs: snapshotForInputs(assessment), message: "Open a public job listing or paste the description below." }, "The job page could not be read.");
      }
    } finally { captureProcessing = false; }
  };

  chrome.storage.onChanged.addListener((_changes, areaName) => { if (areaName === "session") void applyLatestCapture(); });
  await applyLatestCapture();
  repaint();
  settingsButton.addEventListener("click", () => {
    settingsReturn = report ? "report" : "main";
    focusNext = true;
    setState({ kind: "settings", inputs: snapshotForInputs(assessment), notice: null, error: null }, "Settings opened.");
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== "resume-file") return;
    const file = target.files?.item(0);
    if (!file) return;
    const attemptId = newOpaqueVersion();
    const returnTo = state.kind === "settings" ? "settings" : "onboarding";
    parseAttemptId = attemptId;
    focusNext = false;
    setState({ kind: "parsing-resume", inputs: snapshotForInputs(assessment), fileName: file.name, returnTo }, `Reading ${file.name}.`);
    void parseResume(file).then(async (resume) => {
      if (parseAttemptId !== attemptId) return;
      await saveResume(storage, resume);
      assessment = { ...assessment, resume };
      report = null;
      focusNext = true;
      setState(returnTo === "settings" ? { kind: "settings", inputs: snapshotForInputs(assessment), notice: "Resume replaced.", error: null } : normalState(assessment), "Resume saved locally.");
    }).catch((error: unknown) => {
      if (parseAttemptId !== attemptId) return;
      focusNext = true;
      const text = errorMessage(error);
      setState(returnTo === "settings" ? { kind: "settings", inputs: snapshotForInputs(assessment), notice: null, error: text } : { kind: "onboarding-resume", inputs: snapshotForInputs(assessment), error: text }, "The resume was not changed.");
    });
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "save-api-key") {
      const apiKey = root.querySelector<HTMLInputElement>("#api-key")?.value.trim() ?? "";
      if (!apiKey) {
        const inputs = snapshotForInputs(assessment);
        setState(state.kind === "settings" ? { kind: "settings", inputs, notice: null, error: "Paste a Vercel AI Gateway key first." } : { kind: "onboarding-key", inputs, error: "Paste a Vercel AI Gateway key first." }, "A key is required.");
        return;
      }
      void saveApiKey(storage, apiKey).then(() => {
        assessment = { ...assessment, apiKey };
        focusNext = true;
        setState(state.kind === "settings" ? { kind: "settings", inputs: snapshotForInputs(assessment), notice: "Session key saved.", error: null } : normalState(assessment), "AI Gateway connected for this session.");
      }).catch(() => {
        const inputs = snapshotForInputs(assessment);
        setState(state.kind === "settings" ? { kind: "settings", inputs, notice: null, error: "The session key could not be saved." } : { kind: "onboarding-key", inputs, error: "The session key could not be saved." }, "The session key was not saved.");
      });
    } else if (action === "delete-api-key") {
      void deleteApiKey(storage).then(() => {
        assessment = { ...assessment, apiKey: null };
        report = null;
        focusNext = true;
        setState({ kind: "settings", inputs: snapshotForInputs(assessment), notice: "Session key cleared.", error: null }, "Session key cleared.");
      });
    } else if (action === "delete-resume") {
      if (!window.confirm("Delete the saved resume text from this browser?")) return;
      void deleteResume(storage).then(() => {
        abortAnalysis();
        assessment = { ...assessment, resume: null };
        report = null;
        focusNext = true;
        setState(normalState(assessment), "Saved resume deleted.");
      });
    } else if (action === "clear-job" || action === "restart") {
      void deleteJob(storage).then(() => {
        abortAnalysis();
        assessment = { ...assessment, job: null };
        report = null;
        focusNext = true;
        setState(normalState(assessment), "Ready for another job page.");
      });
    } else if (action === "save-pasted-job") {
      const text = normalizeText(root.querySelector<HTMLTextAreaElement>("#job-text")?.value ?? "");
      if (!text) {
        setState({ kind: "capture-error", inputs: snapshotForInputs(assessment), message: "Paste the job description before continuing." }, "Job text is required.");
        return;
      }
      void saveJobConfirmed(storage, { source: "pasted", title: "Pasted job description", url: null, text }).then((job) => {
        assessment = { ...assessment, job };
        report = null;
        focusNext = true;
        setState(normalState(assessment), "Pasted job saved.");
      });
    } else if (action === "close-settings") {
      focusNext = true;
      setState(settingsReturn === "report" && report ? { kind: "report", inputs: snapshotForInputs(assessment), report } : normalState(assessment), "Settings closed.");
    } else if (action === "cancel-analysis") {
      abortAnalysis();
      focusNext = true;
      setState(normalState(assessment, "Analysis cancelled."), "Analysis cancelled.");
    } else if (action === "analyze") {
      const snapshot = analysisSnapshot(assessment);
      if (!snapshot || !assessment.apiKey || !assessment.resume || !assessment.job) return;
      abortAnalysis();
      const attemptId = newOpaqueVersion();
      const controller = new AbortController();
      analyzeAttemptId = attemptId;
      analyzeController = controller;
      setState({ kind: "analyzing", inputs: snapshotForInputs(assessment), phase: "finding-requirements" }, "Finding job requirements.");
      void analyzeFit({
        apiKey: assessment.apiKey, resumeText: assessment.resume.text, jobText: assessment.job.text, signal: controller.signal,
        onPhase: (phase) => { if (analyzeAttemptId === attemptId) setState({ kind: "analyzing", inputs: snapshotForInputs(assessment), phase }, phase === "matching-resume" ? "Matching resume evidence." : "Finding job requirements."); },
      }).then((nextReport) => {
        if (analyzeAttemptId !== attemptId || analyzeController !== controller) return;
        const current = analysisSnapshot(assessment);
        if (!current || current.resumeVersion !== snapshot.resumeVersion || current.jobVersion !== snapshot.jobVersion) return;
        report = nextReport;
        analyzeAttemptId = null;
        analyzeController = null;
        focusNext = true;
        setState({ kind: "report", inputs: snapshotForInputs(assessment), report: nextReport }, "Analysis complete.");
      }).catch((error: unknown) => {
        if (analyzeAttemptId !== attemptId) return;
        analyzeAttemptId = null;
        analyzeController = null;
        if (controller.signal.aborted) return;
        focusNext = true;
        setState({ kind: "analysis-error", inputs: snapshotForInputs(assessment), message: errorMessage(error) }, "Analysis failed. Your inputs were kept.");
      });
    }
  });
}

void boot();
