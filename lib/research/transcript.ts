/**
 * Concall transcript parsing. Speakers are identified in code from the transcript's own turn headers, never from
 * the model, so a statement can only be attributed to management if it sits inside a management turn.
 *
 * Recognised headers (the format RIL and several large companies use):
 *   "Sh V Srikanth 00:00:01 – 00:09:45 (Group Performance)"   presentation turn, management
 *   "Company Speaker (Anshuman Thakur)"                       Q&A answer, management
 *   "Questioner (Manish Adukia, Goldman Sachs)"               Q&A question, analyst
 *   "Moderator" / "Moderator:"                                moderator
 * Text before the first header, or in a transcript whose headers are not recognised, has role "unknown" and can
 * never yield a management statement.
 */
import type { Speaker, SpeakerRole } from "./types";
import { normalizeForMatch, normalizeText } from "./verify";

const TITLE = String.raw`(?:Sh|Shri|Smt|Mr|Mrs|Ms|Dr)\.?`;
const PRESENTATION = new RegExp(String.raw`^${TITLE}\s+([A-Z][A-Za-z.'’ -]{1,50}?)\s+\d{1,2}:\d{2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}:\d{2}(?:\s*\(.*\))?$`);
const COMPANY_SPEAKER = /^Company Speaker\s*\((.+)\)\s*$/i;
const QUESTIONER = /^Questioner\s*\((.+)\)\s*$/i;
const MODERATOR = /^Moderator\s*(?:\(.*\))?\s*:?\s*$/i;
const ROSTER = new RegExp(String.raw`^[•\-*]\s*${TITLE}\s+([^,]+?),\s*(.+)$`);
/** Lines that are page furniture or section dividers, not speech. */
const NOISE = /^(?:\d+\s*©.*|PRESENTATION|Transcript:|Q\s*&\s*A\s*SESSION|QUESTION[- ]AND[- ]ANSWER SESSION)$/i;

export type Section = "presentation" | "qa" | "other";

export interface Turn {
  index: number;
  speaker: Speaker;
  startPage: number;
  /** Prepared remarks (timestamped headers) versus the question-and-answer session. */
  section: Section;
}

export interface Segment {
  page: number;
  turn: number;
  text: string;
}

export interface ParsedTranscript {
  turns: Turn[];
  roster: Map<string, string>;
  segments: Segment[];
  /** Case-preserved, typography-normalised text of all speech, lines joined as a reader would. */
  plain: string;
  /** `plain`, lower-cased: quotes are matched against this. */
  norm: string;
  /** Start offsets of each segment inside `plain`/`norm`. */
  marks: { start: number; page: number; turn: number }[];
}

function joinLines(lines: string[]): { text: string; starts: number[] } {
  let out = "";
  const starts: number[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!out) {
      starts.push(0);
      out = t;
    } else if (out.endsWith("-")) {
      starts.push(out.length);
      out += t;
    } else {
      out += " ";
      starts.push(out.length);
      out += t;
    }
  }
  return { text: out, starts };
}

const unknownSpeaker: Speaker = { name: "Unidentified", role: "unknown", designation: null, header: "" };

export function parseTranscript(pages: string[]): ParsedTranscript {
  const roster = new Map<string, string>();
  const turns: Turn[] = [{ index: 0, speaker: unknownSpeaker, startPage: 1, section: "other" }];
  const segments: Segment[] = [];
  let current = 0;

  const designationFor = (name: string) => roster.get(normalizeForMatch(name)) ?? null;
  const open = (role: SpeakerRole, name: string, header: string, page: number, section: Section) => {
    turns.push({ index: turns.length, speaker: { name: name.trim(), role, designation: role === "management" ? designationFor(name) : null, header }, startPage: page, section });
    current = turns.length - 1;
  };

  pages.forEach((pageText, pi) => {
    const page = pi + 1;
    for (const rawLine of pageText.split("\n")) {
      const line = normalizeText(rawLine);
      if (!line) continue;

      const rost = line.match(ROSTER);
      if (rost && !/\d{2}:\d{2}:\d{2}/.test(line)) {
        roster.set(normalizeForMatch(rost[1]), rost[2].trim());
        continue;
      }
      let m: RegExpMatchArray | null;
      if ((m = line.match(PRESENTATION))) open("management", m[1], line, page, "presentation");
      else if ((m = line.match(COMPANY_SPEAKER))) open("management", m[1], line, page, "qa");
      else if ((m = line.match(QUESTIONER))) open("analyst", m[1].split(",")[0], line, page, "qa");
      else if (MODERATOR.test(line)) open("moderator", "Moderator", line, page, "qa");
      else if (NOISE.test(line)) continue;
      else segments.push({ page, turn: current, text: line });
    }
  });

  const { text, starts } = joinLines(segments.map((s) => s.text));
  return {
    turns,
    roster,
    segments,
    plain: text,
    norm: text.toLowerCase(),
    marks: segments.map((s, i) => ({ start: starts[i], page: s.page, turn: s.turn })),
  };
}

export interface Located {
  page: number;
  turn: Turn;
  /** Offset of the quote in `plain`. */
  offset: number;
  pageCorrected: boolean;
  spansTurns: boolean;
}

function markAt(t: ParsedTranscript, offset: number) {
  let lo = 0;
  let hi = t.marks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t.marks[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return t.marks[lo];
}

/** Finds a quote in the transcript. Prefers the cited page; reports a correction when it had to look elsewhere. */
export function locateQuote(t: ParsedTranscript, quote: string, citedPage: number | null): Located | null {
  const q = normalizeForMatch(quote);
  if (q.length < 8) return null;
  const hits: number[] = [];
  for (let i = t.norm.indexOf(q); i >= 0; i = t.norm.indexOf(q, i + 1)) hits.push(i);
  if (hits.length === 0) return null;

  const withPage = hits.map((o) => ({ o, mark: markAt(t, o) }));
  const onCited = withPage.find((h) => h.mark.page === citedPage);
  const pick = onCited ?? withPage.reduce((a, b) => (Math.abs(a.mark.page - (citedPage ?? 0)) <= Math.abs(b.mark.page - (citedPage ?? 0)) ? a : b));
  const end = markAt(t, pick.o + q.length - 1);
  return {
    page: pick.mark.page,
    turn: t.turns[pick.mark.turn],
    offset: pick.o,
    pageCorrected: !onCited,
    spansTurns: end.turn !== pick.mark.turn,
  };
}

/** ~`radius` characters either side of a match, from the readable text. */
export function contextAround(t: ParsedTranscript, offset: number, length: number, radius = 300): string {
  const a = Math.max(0, offset - radius);
  const b = Math.min(t.plain.length, offset + length + radius);
  return `${a > 0 ? "…" : ""}${t.plain.slice(a, b)}${b < t.plain.length ? "…" : ""}`;
}

/** The text sent to the model: speech with page markers and speaker role tags, so it can skip analysts. */
export function renderForModel(t: ParsedTranscript, section?: Section): string {
  const out: string[] = [];
  let lastPage = 0;
  let lastTurn = -1;
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push(joinLines(buf).text);
    buf = [];
  };
  for (const s of t.segments) {
    if (section && t.turns[s.turn].section !== section) continue;
    if (s.page !== lastPage) {
      flush();
      out.push(`[[page ${s.page}]]`);
      lastPage = s.page;
    }
    if (s.turn !== lastTurn) {
      flush();
      const sp = t.turns[s.turn].speaker;
      const tag = sp.role === "management" ? "MANAGEMENT" : sp.role === "analyst" ? "ANALYST QUESTION (do not extract)" : sp.role === "moderator" ? "MODERATOR (do not extract)" : "UNATTRIBUTED (do not extract)";
      out.push(`<<${tag}: ${sp.name}${sp.designation ? `, ${sp.designation}` : ""}>>`);
      lastTurn = s.turn;
    }
    buf.push(s.text);
  }
  flush();
  return out.join("\n");
}
