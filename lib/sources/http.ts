/**
 * Polite HTTP client for the ingestion scripts: per-host spacing, retry with backoff (honouring Retry-After),
 * timeouts, and an on-disk cache so the same URL is never downloaded twice within its TTL.
 * Raw responses live in data/raw/ (gitignored).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

/** Minimum gap between requests to the same host. */
const HOST_GAP_MS: Record<string, number> = {
  "www.screener.in": 5000,
  "www.nseindia.com": 800,
  "query1.finance.yahoo.com": 400,
};
const DEFAULT_GAP_MS = 800;

const lastHit = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Extra attempts after the first. */
  retries?: number;
  /** Serve from disk if the cached copy is younger than this. 0 disables the cache. */
  cacheTtlMs?: number;
}

export interface Response {
  url: string;
  status: number;
  body: Buffer;
  fetchedAt: string;
  fromCache: boolean;
}

function cachePaths(url: string) {
  const host = new URL(url).host;
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const dir = path.join(RAW_DIR, host);
  return { dir, body: path.join(dir, `${hash}.body`), meta: path.join(dir, `${hash}.json`) };
}

async function readCache(url: string, ttlMs: number): Promise<Response | null> {
  if (ttlMs <= 0) return null;
  const p = cachePaths(url);
  try {
    const [m, s] = await Promise.all([readFile(p.meta, "utf8"), stat(p.body)]);
    const meta = JSON.parse(m) as { fetchedAt: string; status: number };
    if (Date.now() - new Date(meta.fetchedAt).getTime() > ttlMs) return null;
    void s;
    return { url, status: meta.status, body: await readFile(p.body), fetchedAt: meta.fetchedAt, fromCache: true };
  } catch {
    return null;
  }
}

async function writeCache(res: Response) {
  const p = cachePaths(res.url);
  await mkdir(p.dir, { recursive: true });
  await writeFile(p.body, res.body);
  await writeFile(p.meta, JSON.stringify({ url: res.url, status: res.status, fetchedAt: res.fetchedAt }));
}

async function waitTurn(host: string) {
  const gap = (HOST_GAP_MS[host] ?? DEFAULT_GAP_MS) * (host === "www.screener.in" ? 1 + Math.random() * 0.3 : 1);
  const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

/** Fetches a URL. Only 2xx responses are cached. Non-retryable statuses (e.g. 403, 404) are returned, not thrown. */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { headers = {}, timeoutMs = 15000, retries = 3, cacheTtlMs = 0 } = opts;
  const cached = await readCache(url, cacheTtlMs);
  if (cached) return cached;

  const host = new URL(url).host;
  const backoff = [30_000, 60_000, 120_000];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitTurn(host);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : (backoff[attempt] ?? 120_000);
        console.warn(`  ${res.status} from ${host}; waiting ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retries})`);
        await res.arrayBuffer().catch(() => undefined);
        await sleep(wait);
        continue;
      }
      const out: Response = {
        url,
        status: res.status,
        body: Buffer.from(await res.arrayBuffer()),
        fetchedAt: new Date().toISOString(),
        fromCache: false,
      };
      if (res.ok && cacheTtlMs > 0) await writeCache(out);
      return out;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`Request failed for ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export async function requestText(url: string, opts: RequestOptions = {}) {
  const r = await request(url, opts);
  return { ...r, text: r.body.toString("utf8") };
}
