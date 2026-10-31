/**
 * Minimal Gemini client (REST, no SDK). The API key is read from the environment or .env.local, sent only in the
 * `x-goog-api-key` header, and scrubbed from every error message. Prompts and responses are never logged; only
 * token counts and timings are, to data/research/usage.jsonl.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Usage } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export const MODELS = {
  fast: process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite",
  smart: process.env.GEMINI_SMART_MODEL || "",
} as const;

let cachedKey: string | null | undefined;
function apiKey(): string {
  if (cachedKey === undefined) {
    let k = process.env.GEMINI_API_KEY ?? null;
    if (!k) {
      const file = path.join(process.cwd(), ".env.local");
      if (existsSync(file)) k = readFileSync(file, "utf8").match(/^\s*GEMINI_API_KEY\s*=\s*(.*)\s*$/m)?.[1]?.replace(/^["']|["']$/g, "") ?? null;
    }
    cachedKey = k;
  }
  if (!cachedKey) throw new Error("GEMINI_API_KEY is not set (add it to .env.local)");
  return cachedKey;
}

const scrub = (s: string) => {
  const k = cachedKey;
  return k ? s.split(k).join("[REDACTED]") : s;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GenerateOptions {
  model: string;
  /** Short label for the usage log, e.g. "extract:RELIANCE:concall-2026-07". Must not contain secrets. */
  label: string;
  prompt: string;
  system?: string;
  /** Gemini responseSchema (OpenAPI subset, upper-case type names). */
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  /** Gemini 3 thinking level. Omit to use the model default. */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  retries?: number;
}

export interface GenerateResult {
  /** Parsed JSON from the model, not yet validated. */
  json: unknown;
  rawText: string;
  usage: Usage;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public usage?: Partial<Usage>,
  ) {
    super(scrub(message));
  }
}

function logUsage(label: string, u: Usage) {
  const dir = path.join(process.cwd(), "data", "research");
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, "usage.jsonl"), JSON.stringify({ at: new Date().toISOString(), label, ...u }) + "\n");
}

export async function generateJson(o: GenerateOptions): Promise<GenerateResult> {
  const key = apiKey();
  const retries = o.retries ?? 3;
  const body = {
    ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: o.prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: o.maxOutputTokens ?? 8192,
      responseMimeType: "application/json",
      responseSchema: o.schema,
      ...(o.thinkingLevel ? { thinkingConfig: { thinkingLevel: o.thinkingLevel } } : {}),
    },
  };

  const retried: number[] = [];
  let lastErr: LlmError | null = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE}${o.model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      lastErr = new LlmError(`Network error: ${e instanceof Error ? e.message : String(e)}`, null);
      retried.push(0);
      if (attempt <= retries) await sleep(4000 * attempt);
      continue;
    }
    const latencyMs = Date.now() - t0;
    const text = await res.text();

    if (res.status === 429 || res.status >= 500) {
      retried.push(res.status);
      const delay = Number(text.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
      lastErr = new LlmError(`HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
      if (attempt <= retries) await sleep(Number.isFinite(delay) ? delay * 1000 + 500 : [5000, 15000, 45000][attempt - 1] ?? 45000);
      continue;
    }
    if (!res.ok) throw new LlmError(`HTTP ${res.status}: ${text.slice(0, 400)}`, res.status);

    const j = JSON.parse(text);
    const meta = j.usageMetadata ?? {};
    const usage: Usage = {
      model: o.model,
      promptTokens: meta.promptTokenCount ?? 0,
      outputTokens: meta.candidatesTokenCount ?? 0,
      thoughtTokens: meta.thoughtsTokenCount ?? 0,
      totalTokens: meta.totalTokenCount ?? 0,
      latencyMs,
      attempts: attempt,
      retriedStatuses: retried,
    };
    logUsage(o.label, usage);
    const cand = j.candidates?.[0];
    const rawText: string = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    if (cand?.finishReason && cand.finishReason !== "STOP") throw new LlmError(`Generation ended with ${cand.finishReason}; output discarded`, null, usage);
    try {
      return { json: JSON.parse(rawText), rawText, usage };
    } catch {
      throw new LlmError("Model output was not valid JSON; discarded", null, usage);
    }
  }
  throw lastErr ?? new LlmError("Request failed", null);
}
