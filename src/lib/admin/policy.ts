// The rules of logging in, as numbers and pure decisions (D-07, owner
// 2026-10-19): how long a session lives, how many attempts are allowed, and
// when changing an admin would leave the shop without an owner.

/** Thirty minutes without doing anything, and the panel asks to log in again (owner 2026-10-19). */
export const SESSION_IDLE_MS = 30 * 60_000;
/** Twelve hours after logging in, always: once a working day (owner 2026-10-19). */
export const SESSION_MAX_MS = 12 * 3_600_000;
/** A session's last activity is written at most once a minute: not a database write per click. */
export const SESSION_TOUCH_MS = 60_000;

export const SESSION_COOKIE = "__Host-wonzo-beheer";

/** An invitation link works for two days, once. */
export const INVITE_VALID_MS = 48 * 3_600_000;

/**
 * Attempts to log in, counted in the database (one limit for every process).
 * Per account and per address, each with a short and a long window: a few
 * typos cost nothing, a guessing script slows to a crawl, and nobody can lock
 * the owner out for longer than the windows (§ Brute force: not permanent).
 */
export const LOGIN_LIMITS = {
  accountShort: { max: 5, windowMs: 15 * 60_000 },
  accountLong: { max: 20, windowMs: 24 * 3_600_000 },
  visitorShort: { max: 20, windowMs: 15 * 60_000 },
  visitorLong: { max: 100, windowMs: 24 * 3_600_000 },
} as const;

/** The setup page and the invitation form: fewer tries, they are used once. */
export const SETUP_LIMIT = { max: 10, windowMs: 15 * 60_000 } as const;

export type SessionTimes = { createdAt: Date; lastSeenAt: Date; expiresAt: Date };

export function sessionState(s: SessionTimes, now: Date): "valid" | "idle" | "expired" {
  if (now.getTime() >= s.expiresAt.getTime() || now.getTime() - s.createdAt.getTime() >= SESSION_MAX_MS) return "expired";
  if (now.getTime() - s.lastSeenAt.getTime() >= SESSION_IDLE_MS) return "idle";
  return "valid";
}

/**
 * Would this change leave no owner who can log in? `activeOwners` are the
 * owners that are not disabled and have finished their invitation. The
 * target stops being one if it is disabled, reset, or gets another role.
 */
export function leavesNoOwner(activeOwners: readonly number[], targetId: number, targetStaysOwner: boolean): boolean {
  if (targetStaysOwner || !activeOwners.includes(targetId)) return false;
  return activeOwners.filter((id) => id !== targetId).length === 0;
}
