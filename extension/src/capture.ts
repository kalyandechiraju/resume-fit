import { LIMITS, type CaptureEnvelope, type CaptureFailureCode } from "./domain";

export type InjectedCapture = Readonly<{
  kind: "captured";
  title: string;
  url: string;
  text: string;
}> | Readonly<{
  kind: "capture-failed";
  code: CaptureFailureCode;
}>;

function normalizePageText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .trim();
}

/** Runs in the inspected page. Keep this function self-contained: Chrome serializes its body. */
export function extractPageText(): InjectedCapture {
  try {
    const genericTitle = /^(?:careers?|jobs?|job details?|job description|open positions?|opportunities|vacancies)$/iu;
    const documentTitle = document.title.replace(/\s+/gu, " ").trim();
    const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2"));
    let title = "";
    let titleHeading: HTMLElement | null = null;
    for (const heading of headings) {
      const style = getComputedStyle(heading);
      if (style.display === "none" || style.visibility === "hidden" || heading.getClientRects().length === 0) continue;
      const candidate = (heading.innerText || heading.textContent || "").replace(/\s+/gu, " ").trim();
      if (candidate.length < 3 || candidate.length > 300 || genericTitle.test(candidate)) continue;
      if (!title || documentTitle.toLocaleLowerCase().includes(candidate.toLocaleLowerCase())) {
        title = candidate;
        titleHeading = heading;
      }
      if (documentTitle.toLocaleLowerCase().startsWith(candidate.toLocaleLowerCase())) break;
    }
    if (!title) title = documentTitle.slice(0, 300) || "Captured job";

    const normalizedText = (candidate: Element): string => {
      const source = "innerText" in candidate && typeof (candidate as HTMLElement).innerText === "string" ? (candidate as HTMLElement).innerText : candidate.textContent ?? "";
      return source
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1] !== ""))
        .join("\n")
        .trim();
    };
    const looksLikeJob = (text: string): boolean => /(?:qualifications?|requirements?|responsibilities|about the (?:job|role)|what you(?:'|’)ll do|who you are)/iu.test(text);
    if (titleHeading) {
      let container: HTMLElement | null = titleHeading.parentElement;
      while (container && container !== document.body) {
        const text = normalizedText(container);
        if (text.length >= 200 && text.length <= 50_000 && looksLikeJob(text)) {
          return { kind: "captured", title, url: location.href.slice(0, 2048), text };
        }
        container = container.parentElement;
      }
    }
    const selectors = ["main", "article", '[role="main"]', "body"];
    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (!candidate) continue;
      const text = normalizedText(candidate);
      if (text.length === 0) continue;
      if (text.length > 50_000) return { kind: "capture-failed", code: "page-too-large" };
      return { kind: "captured", title, url: location.href.slice(0, 2048), text };
    }
    return { kind: "capture-failed", code: "empty-page" };
  } catch {
    return { kind: "capture-failed", code: "unavailable" };
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseInjectedCapture(value: unknown, captureAttemptId: string): CaptureEnvelope {
  const item = objectRecord(value);
  if (!item) return { kind: "capture-failed", captureAttemptId, code: "unavailable" };
  if (item.kind === "capture-failed" && (item.code === "protected-page" || item.code === "empty-page" || item.code === "page-too-large" || item.code === "unavailable")) {
    return { kind: "capture-failed", captureAttemptId, code: item.code };
  }
  if (item.kind === "captured" && typeof item.title === "string" && typeof item.url === "string" && typeof item.text === "string") {
    const text = normalizePageText(item.text);
    if (text.length > 0 && text.length <= LIMITS.captureChars) {
      return { kind: "captured", captureAttemptId, title: item.title.slice(0, 300), url: item.url.slice(0, 2048), text };
    }
    return { kind: "capture-failed", captureAttemptId, code: text.length > LIMITS.captureChars ? "page-too-large" : "empty-page" };
  }
  return { kind: "capture-failed", captureAttemptId, code: "unavailable" };
}

export function parseInjectionResults(value: unknown, captureAttemptId: string): CaptureEnvelope {
  if (!Array.isArray(value) || value.length === 0) return { kind: "capture-failed", captureAttemptId, code: "unavailable" };
  const first = value[0];
  const item = objectRecord(first);
  return parseInjectedCapture(item?.result, captureAttemptId);
}
