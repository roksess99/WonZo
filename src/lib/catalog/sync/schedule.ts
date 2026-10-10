// When to refresh what (D-31): the whole catalog once a night, stock every
// 2 hours, within the supplier's limits per hour. Pure: the runner passes
// the clock and the run history.

export type RunKind = "full" | "stock";

export type ScheduleInput = {
  now: Date;
  /** The run in progress, if any. */
  running: { id: number; kind: RunKind; startedAt: Date } | null;
  /** When the last successful full run finished. */
  lastFullOk: Date | null;
  /** When the last successful run of any kind finished (both refresh stock). */
  lastAnyOk: Date | null;
};

export type ScheduleDecision =
  | { action: "continue"; runId: number; kind: RunKind }
  | { action: "abandon-and-start"; abandonId: number; kind: RunKind }
  | { action: "start"; kind: RunKind }
  | { action: "idle" };

const HOUR = 3_600_000;
/** A run that has not finished after this is considered stuck (a full run takes about 2 hours). */
export const STUCK_AFTER_MS = 12 * HOUR;
/** The night window for the full run, Dutch time, [from, to). */
export const NIGHT = { from: 1, to: 6 } as const;
export const STOCK_EVERY_MS = 2 * HOUR;

export function amsterdamHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(d));
}

function nextKind({ now, lastFullOk, lastAnyOk }: ScheduleInput): RunKind | null {
  if (!lastFullOk) return "full"; // never had a catalog: start right away
  const sinceFull = now.getTime() - lastFullOk.getTime();
  const hour = amsterdamHour(now);
  if (sinceFull >= 20 * HOUR && hour >= NIGHT.from && hour < NIGHT.to) return "full";
  if (sinceFull >= 30 * HOUR) return "full"; // a missed night: do not wait another day
  if (!lastAnyOk || now.getTime() - lastAnyOk.getTime() >= STOCK_EVERY_MS) return "stock";
  return null;
}

export function decide(input: ScheduleInput): ScheduleDecision {
  const { running, now } = input;
  if (running) {
    if (now.getTime() - running.startedAt.getTime() < STUCK_AFTER_MS) return { action: "continue", runId: running.id, kind: running.kind };
    return { action: "abandon-and-start", abandonId: running.id, kind: nextKind(input) ?? "stock" };
  }
  const kind = nextKind(input);
  return kind ? { action: "start", kind } : { action: "idle" };
}

export type Step = "taxonomies" | "manufacturers" | "products" | "images" | "stock" | "info-nl" | "info-en" | "shipping" | "safety" | "evaluate";

/**
 * The phases of a run. A phase starts when the one before is complete; the
 * steps inside a phase do not depend on each other and share the time, each
 * within the limit of its own endpoint — so a full run takes about as long as
 * its slowest list (12 pages at 9 an hour), not the sum of all lists.
 */
// Manufacturers run beside the lists, not before the products: only the brand
// name needs them, and their list is long at 4 calls an hour (GEMETEN
// 2026-10-06: more than 4 pages of 1000 — it held up the first run an hour).
export const PHASES: Record<RunKind, readonly (readonly Step[])[]> = {
  full: [["taxonomies"], ["products"], ["images", "stock", "info-nl", "info-en", "shipping", "manufacturers"], ["safety"], ["evaluate"]],
  stock: [["stock"], ["evaluate"]],
};

/** The supplier endpoint whose limit a step uses; null for steps that only touch the database. */
export const ENDPOINT: Record<Step, string | null> = {
  taxonomies: "taxonomies",
  manufacturers: "manufacturers",
  products: "products",
  images: "productsimages",
  stock: "productsstockbyhandlingdays",
  "info-nl": "productsinformation",
  "info-en": "productsinformation",
  shipping: "lowest-shipping-costs",
  safety: "productcompliance",
  evaluate: null,
};

export type ProgressRow = { step: Step; group: number; done: boolean };

/**
 * The next step to work on: the first phase with unfinished work, and in it
 * the first unfinished step whose endpoint has room. `null` with `waiting`
 * when every unfinished step of the phase is out of budget; `null` without
 * when the run is complete.
 */
export function nextStep(
  kind: RunKind,
  progress: ProgressRow[],
  hasRoom: (endpoint: string) => boolean,
): { step: Step } | { step: null; waiting: Step[] } {
  for (const phase of PHASES[kind]) {
    const open = phase.filter((step) => {
      const rows = progress.filter((p) => p.step === step);
      // No rows yet: the step has not started, so it is open.
      return rows.length === 0 || rows.some((r) => !r.done);
    });
    if (open.length === 0) continue;
    const ready = open.find((step) => {
      const endpoint = ENDPOINT[step];
      return endpoint === null || hasRoom(endpoint);
    });
    return ready ? { step: ready } : { step: null, waiting: [...open] };
  }
  return { step: null, waiting: [] };
}

/**
 * Supplier limits (GEDOCUMENTEERD, docs/api/LEVERANCIER.md § Rate limits),
 * shop-wide. `max` per `windowMs`; one call below the documented number, so
 * a clock difference never tips us over.
 */
export const LIMITS: Record<string, { max: number; windowMs: number }> = {
  products: { max: 9, windowMs: HOUR },
  productsimages: { max: 9, windowMs: HOUR },
  productsstockbyhandlingdays: { max: 9, windowMs: HOUR },
  productsinformation: { max: 23, windowMs: HOUR },
  manufacturers: { max: 4, windowMs: HOUR },
  taxonomies: { max: 23, windowMs: HOUR },
  productcompliance: { max: 1, windowMs: 6_000 },
  "lowest-shipping-costs": { max: 35, windowMs: 6 * HOUR },
};

export function withinLimit(endpoint: keyof typeof LIMITS | string, callsInWindow: number): boolean {
  const limit = LIMITS[endpoint];
  if (!limit) throw new Error(`No limit known for ${endpoint}`);
  return callsInWindow < limit.max;
}
