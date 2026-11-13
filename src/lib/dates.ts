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

const offsetMinutes = (d: Date) => {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")!.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};

/**
 * A wall-clock time in the Netherlands ("2026-11-03T09:00", as a
 * datetime-local field sends it) as an instant; null when it is not one. The
 * offset is checked on the result too, so a time next to the summer-time
 * switch lands right.
 */
export function amsterdamLocalToInstant(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  let instant = wall - offsetMinutes(new Date(wall)) * 60_000;
  instant = wall - offsetMinutes(new Date(instant)) * 60_000;
  return new Date(instant);
}

/** The other way: an instant as "YYYY-MM-DDTHH:mm" in the Netherlands, for a datetime-local field. */
export function instantToAmsterdamLocal(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
