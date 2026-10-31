/**
 * Reads the first page of a filing PDF. The PDF is cached under data/raw/ (gitignored); only a short normalised
 * excerpt is kept. Any failure yields a `failed` excerpt with a reason and never throws.
 */
import { extractText, getDocumentProxy } from "unpdf";
import type { AttachmentExcerpt } from "../data/types";
import { request } from "./http";

export const MAX_EXCERPT_CHARS = 1500;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** First page only, whitespace-collapsed, capped. */
export function normaliseExcerpt(pageText: string): string {
  return pageText.replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT_CHARS);
}

export async function excerptFromBuffer(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  return normaliseExcerpt(Array.isArray(text) ? (text[0] ?? "") : String(text));
}

export async function fetchExcerpt(url: string): Promise<AttachmentExcerpt> {
  const base = { page: 1 as const, url, extractedAt: new Date().toISOString() };
  try {
    const res = await request(url, {
      headers: { Referer: "https://www.nseindia.com/", Accept: "application/pdf,*/*" },
      timeoutMs: 45_000,
      retries: 2,
      cacheTtlMs: 30 * 86400_000,
    });
    if (res.status !== 200) return { ...base, status: "failed", text: "", reason: `HTTP ${res.status}` };
    if (res.body.length > MAX_PDF_BYTES) return { ...base, status: "failed", text: "", reason: `PDF larger than ${MAX_PDF_BYTES / 1024 / 1024} MB` };
    if (res.body.subarray(0, 5).toString("latin1") !== "%PDF-") return { ...base, status: "failed", text: "", reason: "Response was not a PDF" };
    const text = await excerptFromBuffer(new Uint8Array(res.body));
    if (text.length < 20) return { ...base, status: "failed", text: "", reason: "No extractable text on page 1 (scanned image?)" };
    return { ...base, status: "ok", text };
  } catch (e) {
    return { ...base, status: "failed", text: "", reason: e instanceof Error ? e.message.slice(0, 160) : "Unknown error" };
  }
}
