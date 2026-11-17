// Calendar months in the Netherlands, as instants: what "this month" means
// for the dashboard and the VAT overview. Summer time ends in October, so the
// offset is asked for the first of the month itself, not for today. Pure.

/** Year and month (1–12) of an instant in the Netherlands. */
export function amsterdamYearMonth(d: Date): { year: number; month: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", timeZone: "Europe/Amsterdam" }).formatToParts(d).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month) };
}

/** Midnight on the first of that month in the Netherlands. */
export function amsterdamMonthStartOf(year: number, month: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, 1));
  const offset = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", timeZoneName: "longOffset" }).formatToParts(guess).find((p) => p.type === "timeZoneName")!.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);
  const minutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - minutes * 60_000);
}

/** The month as [from, to): from midnight on the 1st up to midnight on the 1st of the next. */
export function amsterdamMonthRange(year: number, month: number): { from: Date; to: Date } {
  return { from: amsterdamMonthStartOf(year, month), to: month === 12 ? amsterdamMonthStartOf(year + 1, 1) : amsterdamMonthStartOf(year, month + 1) };
}
