const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Reads "quarter and half year ended September 30, 2026" and "ended 30th September 2026" style phrases into
 * YYYY-MM-DD. Returns null rather than guessing when the text states no period.
 */
export function periodEndFromText(text: string): string | null {
  const lead = String.raw`(?:quarter|half[- ]year|year|period)(?: and (?:half[- ]year|six months|year|nine months|twelve months))? ended (?:on )?(?:the )?`;
  const mdy = text.match(new RegExp(String.raw`${lead}([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})`, "i"));
  const dmy = text.match(new RegExp(String.raw`${lead}(\d{1,2})(?:st|nd|rd|th)?,? ([A-Za-z]+),? (\d{4})`, "i"));
  let mon: string | undefined, day: string | undefined, year: string | undefined;
  if (dmy && MONTHS.includes(dmy[2].toLowerCase())) [, day, mon, year] = dmy;
  else if (mdy && MONTHS.includes(mdy[1].toLowerCase())) [, mon, day, year] = mdy;
  if (!mon || !day || !year) return null;
  return `${year}-${String(MONTHS.indexOf(mon.toLowerCase()) + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}
