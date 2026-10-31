/** Session timing helpers. Tiering lives in materiality.ts. */

/** The session close (15:30 IST) of an ISO date, in epoch ms. */
export const sessionCloseMs = (date: string) => new Date(`${date}T15:30:00+05:30`).getTime();

/** True when a filing landed in the 36 hours before the latest session's close, so that session can reflect it. */
export function reactsTo(announcedAtIso: string, priceDate: string): boolean {
  const diffH = (sessionCloseMs(priceDate) - new Date(announcedAtIso).getTime()) / 3_600_000;
  return diffH >= 0 && diffH <= 36;
}
