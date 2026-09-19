import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import { LIMITS, newOpaqueVersion, normalizeText, type ResumeDocument, type ResumeFormat } from "./domain";

export type ResumeErrorCode = "unsupported-format" | "too-large" | "too-many-pages" | "invalid-file" | "empty-text" | "text-too-large" | "parse-failed";

export class ResumeParseError extends Error {
  readonly code: ResumeErrorCode;

  constructor(code: ResumeErrorCode, message: string) {
    super(message);
    this.name = "ResumeParseError";
    this.code = code;
  }
}

function formatForFile(fileName: string): ResumeFormat | null {
  const lower = fileName.toLocaleLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function checkText(text: string): string {
  const normalized = normalizeText(text);
  if (normalized.length === 0) throw new ResumeParseError("empty-text", "No selectable text was found in this file.");
  if (normalized.length > LIMITS.resumeChars) throw new ResumeParseError("text-too-large", "The extracted resume text is too large.");
  return normalized;
}

async function parsePdf(buffer: ArrayBuffer): Promise<Readonly<{ text: string; pageCount: number }>> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    if (pdf.numPages > LIMITS.resumePages) throw new ResumeParseError("too-many-pages", `PDF resumes must have ${LIMITS.resumePages} pages or fewer.`);
    const extracted = await extractText(pdf, { mergePages: true });
    return { text: checkText(extracted.text), pageCount: pdf.numPages };
  } catch (error) {
    if (error instanceof ResumeParseError) throw error;
    throw new ResumeParseError("parse-failed", "The PDF could not be read locally.");
  }
}

async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  try {
    const files = unzipSync(new Uint8Array(buffer), {
      filter: ({ name, originalSize }) => name === "word/document.xml" && originalSize <= LIMITS.resumeBytes * 2,
    });
    const documentXml = files["word/document.xml"];
    if (!documentXml) throw new ResumeParseError("invalid-file", "This DOCX does not contain a readable document.");

    const xml = new DOMParser().parseFromString(strFromU8(documentXml), "application/xml");
    if (xml.querySelector("parsererror")) throw new ResumeParseError("invalid-file", "This DOCX contains invalid document data.");

    const text = Array.from(xml.getElementsByTagNameNS("*", "p"), (paragraph) => paragraph.textContent ?? "").join("\n");
    return checkText(text);
  } catch (error) {
    if (error instanceof ResumeParseError) throw error;
    throw new ResumeParseError("parse-failed", "The DOCX could not be read locally.");
  }
}

export async function parseResume(file: File): Promise<ResumeDocument> {
  const format = formatForFile(file.name);
  if (!format) throw new ResumeParseError("unsupported-format", "Choose a PDF or DOCX resume. Legacy DOC files are not supported.");
  if (file.size > LIMITS.resumeBytes) throw new ResumeParseError("too-large", "Resume files must be 5 MB or smaller.");
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new ResumeParseError("invalid-file", "The selected file could not be read.");
  }
  const bytes = new Uint8Array(buffer);
  if (format === "pdf" && !hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw new ResumeParseError("invalid-file", "This file is not a valid PDF.");
  if (format === "docx" && !hasPrefix(bytes, [0x50, 0x4b])) throw new ResumeParseError("invalid-file", "This file is not a valid DOCX.");
  const parsed = format === "pdf" ? await parsePdf(buffer) : { text: await parseDocx(buffer), pageCount: null };
  return {
    resumeVersion: newOpaqueVersion(),
    fileName: file.name.slice(0, 255),
    format,
    text: parsed.text,
    pageCount: parsed.pageCount,
  };
}
