/** Page-aware PDF text. Pages are 1-based everywhere downstream, matching what a PDF viewer shows. */
import { extractText, getDocumentProxy } from "unpdf";
import { request } from "../sources/http";

export interface PdfPages {
  url: string;
  pages: string[];
  bytes: number;
  fetchedAt: string;
}

const REFERER: Record<string, string> = {
  "www.bseindia.com": "https://www.bseindia.com/",
  "nsearchives.nseindia.com": "https://www.nseindia.com/",
  "archives.nseindia.com": "https://www.nseindia.com/",
};

export async function loadPdfPages(url: string): Promise<PdfPages> {
  const host = new URL(url).host;
  const res = await request(url, {
    headers: { Referer: REFERER[host] ?? `https://${host}/`, Accept: "application/pdf,*/*" },
    timeoutMs: 60_000,
    retries: 2,
    cacheTtlMs: 30 * 86400_000,
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} fetching ${url}`);
  if (res.body.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error(`Not a PDF: ${url}`);
  const pdf = await getDocumentProxy(new Uint8Array(res.body));
  const { text } = await extractText(pdf, { mergePages: false });
  return { url, pages: text as string[], bytes: res.body.length, fetchedAt: res.fetchedAt };
}
