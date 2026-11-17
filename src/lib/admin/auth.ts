// Logging in to the panel and managing who may (D-07, owner 2026-10-19;
// .claude/rules/beveiliging.md § Authenticatie, § Sessies). E-mail, password
// and code in one form; sessions in the database, only their hash; the first
// owner from a setup page that closes itself in the database; everyone after
// that by invitation. Every change is in the audit log, in the same
// transaction. Server-side only.

import { appendAudit } from "./audit";
import {
  adminKey,
  decryptText,
  encryptText,
  hashPassword,
  isToken,
  matchTotp,
  needsRehash,
  newRecoveryCodes,
  newToken,
  normalizeRecoveryCode,
  openPending,
  PASSWORD_MAX,
  passwordProblem,
  recoveryHash,
  sha256,
  verifyPassword,
} from "./crypto";
import { isRole, type Role } from "./permissions";
import { INVITE_VALID_MS, leavesNoOwner, LOGIN_LIMITS, SESSION_MAX_MS, SESSION_TOUCH_MS, SETUP_LIMIT, sessionState } from "./policy";
import { fromDbTime, getPool, isDuplicateKey, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import { allowHit } from "@/lib/db/rate-limit";
import { sameSecret } from "@/lib/http";
import { enqueue } from "@/lib/orders/outbox";

if (typeof window !== "undefined") throw new Error("Admin auth runs on the server");

export type SessionAdmin = { id: string; name: string; role: Role; actor: string };

const affected = (result: unknown) => (result as { affectedRows?: number }).affectedRows ?? 0;
const actorOf = (id: number) => `admin:${id}`;

/** A result decided inside a transaction that must not be committed. */
class Abort<T> extends Error {
  constructor(readonly result: T) {
    super("abort");
  }
}

async function inTransaction<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(fn);
  } catch (err) {
    if (err instanceof Abort) return err.result as T;
    throw err;
  }
}

// ---------------------------------------------------------------- input

export function parseEmail(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim().toLowerCase();
  return s.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ? s : null;
}

export function parseName(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim().replace(/\s+/g, " ");
  return s.length >= 1 && s.length <= 80 && !/[\u0000-\u001f\u007f]/.test(s) ? s : null;
}

const text = (x: unknown, max: number) => (typeof x === "string" && x.length <= max ? x : "");

// ---------------------------------------------------------------- sessions

async function createSession(conn: Connection, adminId: number, now: Date): Promise<string> {
  const token = newToken();
  await conn.query("INSERT INTO admin_sessions (id_hash, admin_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)", [
    sha256(token),
    adminId,
    toDbTime(now),
    toDbTime(now),
    toDbTime(new Date(now.getTime() + SESSION_MAX_MS)),
  ]);
  return token;
}

/** The admin behind a session cookie, or null: unknown, idle for 30 minutes, older than 12 hours, or the admin is disabled. */
export async function readSession(db: Queryable, token: string | undefined, now: Date = new Date()): Promise<SessionAdmin | null> {
  if (!isToken(token)) return null;
  const idHash = sha256(token);
  const [r] = await selectRows<{ admin_id: number | string; name: string; role: string; created_at: string; last_seen_at: string; expires_at: string }>(
    db,
    `SELECT s.admin_id, a.name, a.role, s.created_at, s.last_seen_at, s.expires_at
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.id_hash = ? AND a.disabled_at IS NULL AND a.password_hash IS NOT NULL`,
    [idHash],
  );
  if (!r || !isRole(r.role)) return null;
  const lastSeenAt = fromDbTime(r.last_seen_at);
  if (sessionState({ createdAt: fromDbTime(r.created_at), lastSeenAt, expiresAt: fromDbTime(r.expires_at) }, now) !== "valid") {
    await db.query("DELETE FROM admin_sessions WHERE id_hash = ?", [idHash]);
    return null;
  }
  if (now.getTime() - lastSeenAt.getTime() >= SESSION_TOUCH_MS) await db.query("UPDATE admin_sessions SET last_seen_at = ? WHERE id_hash = ?", [toDbTime(now), idHash]);
  const id = Number(r.admin_id);
  return { id: String(id), name: r.name, role: r.role, actor: actorOf(id) };
}

/** Logging out removes the row, not only the cookie (§ Sessies). */
export async function logout(token: string | undefined, now: Date = new Date()): Promise<void> {
  if (!isToken(token)) return;
  await withTransaction(async (conn) => {
    const [s] = await selectRows<{ admin_id: number | string }>(conn, "SELECT admin_id FROM admin_sessions WHERE id_hash = ? FOR UPDATE", [sha256(token)]);
    if (!s) return;
    await conn.query("DELETE FROM admin_sessions WHERE id_hash = ?", [sha256(token)]);
    await appendAudit(conn, { actor: actorOf(Number(s.admin_id)), action: "admin.logout", objectType: "admin", objectId: Number(s.admin_id) }, now);
  });
}

/** Every session of this admin ends at once, on every device. */
export async function logoutEverywhere(adminId: number, actor: string, now: Date = new Date()): Promise<number> {
  return withTransaction(async (conn) => {
    const [result] = await conn.query("DELETE FROM admin_sessions WHERE admin_id = ?", [adminId]);
    await appendAudit(conn, { actor, action: "admin.logout-all", objectType: "admin", objectId: adminId, after: { sessions: affected(result) } }, now);
    return affected(result);
  });
}

/** For the scheduled job: sessions past their time, and invitations long expired. */
export async function pruneAdminSessions(now: Date = new Date()): Promise<number> {
  const pool = getPool();
  const [sessions] = await pool.query("DELETE FROM admin_sessions WHERE expires_at <= ? OR last_seen_at <= ?", [toDbTime(now), toDbTime(new Date(now.getTime() - 30 * 60_000))]);
  await pool.query("DELETE FROM admin_invites WHERE expires_at < ?", [toDbTime(new Date(now.getTime() - 30 * 24 * 3_600_000))]);
  return affected(sessions);
}

// ---------------------------------------------------------------- logging in

export type LoginResult = { ok: true; token: string; adminId: number; method: "totp" | "recovery" } | { ok: false; error: "invalid" | "rate-limit" | "not-configured" };

let dummyHash: Promise<string> | null = null;
/** For an address that is not an admin: the same scrypt work, so the answer takes as long (§ Authenticatie: no oracle). */
const dummy = () => (dummyHash ??= hashPassword(newToken()));
const DUMMY_SECRET = "A".repeat(32);

type LoginRow = { id: number | string; password_hash: string; totp_secret_enc: string; totp_last_step: number | string | null };

export async function login(input: { email: unknown; password: unknown; code: unknown; visitor: string }, now: Date = new Date()): Promise<LoginResult> {
  let key: Buffer;
  try {
    key = adminKey();
  } catch {
    return { ok: false, error: "not-configured" };
  }
  const email = parseEmail(input.email) ?? "";
  const password = text(input.password, PASSWORD_MAX * 4);
  const code = text(input.code, 40).trim();

  // The limits first: a blocked attempt does no work and learns nothing.
  const account = sha256(`login:${email}`).slice(0, 32);
  const L = LOGIN_LIMITS;
  const allowed = await Promise.all([
    allowHit(`login-v:${input.visitor}`, L.visitorShort.max, L.visitorShort.windowMs, now),
    allowHit(`login-vd:${input.visitor}`, L.visitorLong.max, L.visitorLong.windowMs, now),
    allowHit(`login-a:${account}`, L.accountShort.max, L.accountShort.windowMs, now),
    allowHit(`login-ad:${account}`, L.accountLong.max, L.accountLong.windowMs, now),
  ]);
  if (allowed.includes(false)) return { ok: false, error: "rate-limit" };

  const pool = getPool();
  const [row] = email
    ? await selectRows<LoginRow>(
        pool,
        "SELECT id, password_hash, totp_secret_enc, totp_last_step FROM admins WHERE email = ? AND disabled_at IS NULL AND password_hash IS NOT NULL AND totp_secret_enc IS NOT NULL",
        [email],
      )
    : [];
  const id = row ? Number(row.id) : 0;
  const passwordOk = await verifyPassword(password, row?.password_hash ?? (await dummy()));
  // The second factor is checked whatever the password was: a right password takes as long as a wrong one.
  const secret = row ? decryptText(row.totp_secret_enc, `totp:${id}`, key) : null;
  const lastStep = row?.totp_last_step === null || row?.totp_last_step === undefined ? null : Number(row.totp_last_step);
  const step = matchTotp(secret ?? DUMMY_SECRET, code, now, lastStep);
  const recovery = step === null ? normalizeRecoveryCode(code) : null;
  const [unused] = row && recovery ? await selectRows<{ x: number }>(pool, "SELECT 1 AS x FROM admin_recovery_codes WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL", [id, recoveryHash(recovery)]) : [];

  const failed = async () => {
    // Only for an existing account: the log says someone tried, never what was typed.
    if (row) await withTransaction((conn) => appendAudit(conn, { actor: "visitor", action: "admin.login-failed", objectType: "admin", objectId: id }, now));
    return { ok: false, error: "invalid" } as const;
  };
  if (!row || !passwordOk || !secret || (step === null && !unused)) return failed();

  const result = await inTransaction<LoginResult | null>(async (conn) => {
    let method: "totp" | "recovery" = "totp";
    if (step !== null) {
      // Compare-and-set: two logins with the same code, one wins (no replay).
      const [r] = await conn.query("UPDATE admins SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)", [step, id, step]);
      if (affected(r) !== 1) throw new Abort(null);
    } else {
      const [r] = await conn.query("UPDATE admin_recovery_codes SET used_at = ? WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL", [toDbTime(now), id, recoveryHash(recovery!)]);
      if (affected(r) !== 1) throw new Abort(null);
      method = "recovery";
      const [left] = await selectRows<{ n: number | string }>(conn, "SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE admin_id = ? AND used_at IS NULL", [id]);
      await appendAudit(conn, { actor: actorOf(id), action: "admin.recovery-used", objectType: "admin", objectId: id, after: { codesLeft: Number(left?.n ?? 0) } }, now);
      // A mail to the admin (§ Authenticatie, herstelcodes): if it was not them, they know.
      await enqueue(conn, "admin-recovery-used", `admin:${id}:recovery:${now.getTime()}`, { adminId: id, at: now.toISOString() }, now);
    }
    if (needsRehash(row.password_hash)) await conn.query("UPDATE admins SET password_hash = ? WHERE id = ?", [await hashPassword(password), id]);
    const token = await createSession(conn, id, now);
    await appendAudit(conn, { actor: actorOf(id), action: "admin.login", objectType: "admin", objectId: id, after: { method } }, now);
    return { ok: true, token, adminId: id, method };
  });
  return result ?? failed();
}

// ---------------------------------------------------------------- new credentials (setup and invitation)

export type CredentialError = "password-short" | "password-long" | "password-is-email" | "code" | "rate-limit" | "not-configured";

type Credentials = { passwordHash: string; secret: string; step: number; recoveryCodes: string[] };

/** Password and the first code from the app, checked against the secret that was shown. */
async function checkCredentials(input: { password: unknown; pending: unknown; code: unknown }, email: string, context: string, now: Date): Promise<{ ok: true; value: Credentials } | { ok: false; error: CredentialError }> {
  let key: Buffer;
  try {
    key = adminKey();
  } catch {
    return { ok: false, error: "not-configured" };
  }
  const password = text(input.password, PASSWORD_MAX * 4);
  const problem = passwordProblem(password, email);
  if (problem) return { ok: false, error: `password-${problem}` };
  const secret = openPending(input.pending, context, now, key);
  const step = secret ? matchTotp(secret, text(input.code, 20).trim(), now, null) : null;
  if (!secret || step === null) return { ok: false, error: "code" };
  return { ok: true, value: { passwordHash: await hashPassword(password), secret, step, recoveryCodes: newRecoveryCodes() } };
}

async function storeCredentials(conn: Connection, adminId: number, c: Credentials, now: Date): Promise<void> {
  await conn.query("UPDATE admins SET password_hash = ?, totp_secret_enc = ?, totp_last_step = ?, activated_at = COALESCE(activated_at, ?) WHERE id = ?", [
    c.passwordHash,
    encryptText(c.secret, `totp:${adminId}`, adminKey()),
    c.step,
    toDbTime(now),
    adminId,
  ]);
  await conn.query("DELETE FROM admin_recovery_codes WHERE admin_id = ?", [adminId]);
  for (const code of c.recoveryCodes) await conn.query("INSERT INTO admin_recovery_codes (admin_id, code_hash) VALUES (?, ?)", [adminId, recoveryHash(normalizeRecoveryCode(code)!)]);
}

export type NewAccountResult = { ok: true; token: string; recoveryCodes: string[] } | { ok: false; error: CredentialError | "closed" | "setup-token" | "email" | "name" | "invalid" };

// ---------------------------------------------------------------- the first owner

/** ADMIN_SETUP_TOKEN, at least 32 characters: without it the setup page does not exist. */
export function setupToken(env: Record<string, string | undefined> = process.env): string | null {
  const t = (env.ADMIN_SETUP_TOKEN ?? "").trim();
  return t.length >= 32 ? t : null;
}

/** Open until the first admin exists: one row in admin_setup closes it for good. */
export async function setupOpen(db: Queryable = getPool()): Promise<boolean> {
  const [row] = await selectRows<{ x: number }>(db, "SELECT 1 AS x FROM admin_setup LIMIT 1");
  return !row;
}

export async function setupFirstOwner(
  input: { setupToken: unknown; email: unknown; name: unknown; password: unknown; pending: unknown; code: unknown; visitor: string },
  now: Date = new Date(),
): Promise<NewAccountResult> {
  const expected = setupToken();
  if (!expected) return { ok: false, error: "closed" };
  if (!(await allowHit(`setup:${input.visitor}`, SETUP_LIMIT.max, SETUP_LIMIT.windowMs, now))) return { ok: false, error: "rate-limit" };
  if (!(await setupOpen())) return { ok: false, error: "closed" };
  if (!sameSecret(text(input.setupToken, 200).trim(), expected)) return { ok: false, error: "setup-token" };
  const email = parseEmail(input.email);
  if (!email) return { ok: false, error: "email" };
  const name = parseName(input.name);
  if (!name) return { ok: false, error: "name" };
  const checked = await checkCredentials(input, email, "setup", now);
  if (!checked.ok) return checked;

  return inTransaction<NewAccountResult>(async (conn) => {
    const [ins] = await conn.query("INSERT INTO admins (email, name, role, created_at, created_by) VALUES (?, ?, 'eigenaar', ?, 'setup')", [email, name, toDbTime(now)]);
    const id = Number((ins as { insertId: number | string }).insertId);
    try {
      // The lock of the setup page: a second row cannot exist (primary key, CHECK id = 1).
      await conn.query("INSERT INTO admin_setup (id, admin_id, done_at) VALUES (1, ?, ?)", [id, toDbTime(now)]);
    } catch (err) {
      if (isDuplicateKey(err)) throw new Abort<NewAccountResult>({ ok: false, error: "closed" });
      throw err;
    }
    await storeCredentials(conn, id, checked.value, now);
    await appendAudit(conn, { actor: actorOf(id), action: "admin.setup", objectType: "admin", objectId: id, after: { role: "eigenaar" } }, now);
    const token = await createSession(conn, id, now);
    return { ok: true, token, recoveryCodes: checked.value.recoveryCodes };
  });
}

// ---------------------------------------------------------------- invitations

export type ManageError = "not-found" | "last-owner" | "self" | "state" | "email" | "name" | "role" | "exists";
export type ManageResult = { ok: true } | { ok: false; error: ManageError };

/** A new admin with a role; the invitation mail goes out with the outbox, its key is made at sending. */
export async function inviteAdmin(actor: string, input: { email: unknown; name: unknown; role: unknown }, now: Date = new Date()): Promise<ManageResult> {
  const email = parseEmail(input.email);
  if (!email) return { ok: false, error: "email" };
  const name = parseName(input.name);
  if (!name) return { ok: false, error: "name" };
  if (!isRole(input.role)) return { ok: false, error: "role" };
  const role = input.role;
  return inTransaction<ManageResult>(async (conn) => {
    let id: number;
    try {
      const [ins] = await conn.query("INSERT INTO admins (email, name, role, created_at, created_by) VALUES (?, ?, ?, ?, ?)", [email, name, role, toDbTime(now), actor.slice(0, 60)]);
      id = Number((ins as { insertId: number | string }).insertId);
    } catch (err) {
      if (isDuplicateKey(err)) throw new Abort<ManageResult>({ ok: false, error: "exists" });
      throw err;
    }
    await enqueue(conn, "admin-invite", `admin:${id}:invite:invited:${now.getTime()}`, { adminId: id }, now);
    await appendAudit(conn, { actor, action: "admin.invited", objectType: "admin", objectId: id, after: { role } }, now);
    return { ok: true };
  });
}

/**
 * The key for an invitation mail, made when the mail is composed: it exists
 * nowhere as text but in that mail. An earlier link of the same admin stops
 * working. null when the admin has no invitation to accept (any more).
 */
export async function issueInvite(conn: Connection, adminId: number, now: Date): Promise<{ token: string; expiresAt: Date } | null> {
  const [a] = await selectRows<{ x: number }>(conn, "SELECT 1 AS x FROM admins WHERE id = ? AND password_hash IS NULL AND disabled_at IS NULL FOR UPDATE", [adminId]);
  if (!a) return null;
  await conn.query("UPDATE admin_invites SET used_at = ? WHERE admin_id = ? AND used_at IS NULL", [toDbTime(now), adminId]);
  const token = newToken();
  const expiresAt = new Date(now.getTime() + INVITE_VALID_MS);
  await conn.query("INSERT INTO admin_invites (token_hash, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [sha256(token), adminId, toDbTime(now), toDbTime(expiresAt)]);
  return { token, expiresAt };
}

export type OpenInvite = { adminId: number; email: string; name: string; role: Role; tokenHash: string };

export async function readInvite(db: Queryable, token: unknown, now: Date = new Date()): Promise<OpenInvite | null> {
  if (!isToken(token)) return null;
  const tokenHash = sha256(token);
  const [r] = await selectRows<{ admin_id: number | string; email: string; name: string; role: string }>(
    db,
    `SELECT i.admin_id, a.email, a.name, a.role FROM admin_invites i JOIN admins a ON a.id = i.admin_id
      WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ? AND a.password_hash IS NULL AND a.disabled_at IS NULL`,
    [tokenHash, toDbTime(now)],
  );
  if (!r || !isRole(r.role)) return null;
  return { adminId: Number(r.admin_id), email: r.email, name: r.name, role: r.role, tokenHash };
}

export async function acceptInvite(input: { token: unknown; password: unknown; pending: unknown; code: unknown; visitor: string }, now: Date = new Date()): Promise<NewAccountResult> {
  if (!(await allowHit(`invite:${input.visitor}`, SETUP_LIMIT.max, SETUP_LIMIT.windowMs, now))) return { ok: false, error: "rate-limit" };
  const invite = await readInvite(getPool(), input.token, now);
  if (!invite) return { ok: false, error: "invalid" };
  const checked = await checkCredentials(input, invite.email, `invite:${invite.tokenHash}`, now);
  if (!checked.ok) return checked;
  return inTransaction<NewAccountResult>(async (conn) => {
    // Once: the row is locked and must still be open when this transaction gets it.
    const [open] = await selectRows<{ x: number }>(conn, "SELECT 1 AS x FROM admin_invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? FOR UPDATE", [invite.tokenHash, toDbTime(now)]);
    if (!open) throw new Abort<NewAccountResult>({ ok: false, error: "invalid" });
    const [a] = await selectRows<{ x: number }>(conn, "SELECT 1 AS x FROM admins WHERE id = ? AND password_hash IS NULL AND disabled_at IS NULL FOR UPDATE", [invite.adminId]);
    if (!a) throw new Abort<NewAccountResult>({ ok: false, error: "invalid" });
    await conn.query("UPDATE admin_invites SET used_at = ? WHERE admin_id = ? AND used_at IS NULL", [toDbTime(now), invite.adminId]);
    await storeCredentials(conn, invite.adminId, checked.value, now);
    await appendAudit(conn, { actor: actorOf(invite.adminId), action: "admin.activated", objectType: "admin", objectId: invite.adminId, after: { role: invite.role } }, now);
    const token = await createSession(conn, invite.adminId, now);
    return { ok: true, token, recoveryCodes: checked.value.recoveryCodes };
  });
}

// ---------------------------------------------------------------- managing admins (permission "beheerders")

type Target = { id: number; role: Role; disabled: boolean; pending: boolean };

/**
 * Locks every active owner (by id) and then the target, for the rest of the
 * transaction: two owners demoting each other at the same moment cannot both
 * succeed (the second sees the first's change). Always this order, so two
 * such transactions wait for each other instead of deadlocking.
 */
async function lockTarget(conn: Connection, adminId: number): Promise<{ target: Target; owners: number[] }> {
  const owners = await selectRows<{ id: number | string }>(conn, "SELECT id FROM admins WHERE role = 'eigenaar' AND disabled_at IS NULL AND password_hash IS NOT NULL ORDER BY id FOR UPDATE");
  const [t] = await selectRows<{ id: number | string; role: string; disabled_at: string | null; password_hash: string | null }>(
    conn,
    "SELECT id, role, disabled_at, password_hash FROM admins WHERE id = ? FOR UPDATE",
    [adminId],
  );
  if (!t || !isRole(t.role)) throw new Abort<ManageResult>({ ok: false, error: "not-found" });
  return { target: { id: Number(t.id), role: t.role, disabled: t.disabled_at !== null, pending: t.password_hash === null }, owners: owners.map((o) => Number(o.id)) };
}

const selfId = (actor: string) => (actor.startsWith("admin:") ? Number(actor.slice(6)) : NaN);

/** Common to the changes below: never on yourself, never the last owner. */
async function manage(actor: string, adminId: number, staysOwner: (t: Target) => boolean, act: (conn: Connection, t: Target) => Promise<void>): Promise<ManageResult> {
  if (!Number.isSafeInteger(adminId) || adminId <= 0) return { ok: false, error: "not-found" };
  if (selfId(actor) === adminId) return { ok: false, error: "self" };
  return inTransaction<ManageResult>(async (conn) => {
    const { target, owners } = await lockTarget(conn, adminId);
    if (leavesNoOwner(owners, target.id, staysOwner(target))) throw new Abort<ManageResult>({ ok: false, error: "last-owner" });
    await act(conn, target);
    return { ok: true };
  });
}

/** Another role. Their sessions end: new rights, a new login (§ Sessies). */
export async function changeRole(actor: string, adminId: number, role: unknown, now: Date = new Date()): Promise<ManageResult> {
  if (!isRole(role)) return { ok: false, error: "role" };
  return manage(
    actor,
    adminId,
    () => role === "eigenaar",
    async (conn, t) => {
      if (t.role === role) throw new Abort<ManageResult>({ ok: true });
      await conn.query("UPDATE admins SET role = ? WHERE id = ?", [role, t.id]);
      await conn.query("DELETE FROM admin_sessions WHERE admin_id = ?", [t.id]);
      await appendAudit(conn, { actor, action: "admin.role-changed", objectType: "admin", objectId: t.id, before: { role: t.role }, after: { role } }, now);
    },
  );
}

export async function disableAdmin(actor: string, adminId: number, now: Date = new Date()): Promise<ManageResult> {
  return manage(
    actor,
    adminId,
    () => false,
    async (conn, t) => {
      if (t.disabled) throw new Abort<ManageResult>({ ok: false, error: "state" });
      await conn.query("UPDATE admins SET disabled_at = ? WHERE id = ?", [toDbTime(now), t.id]);
      await conn.query("DELETE FROM admin_sessions WHERE admin_id = ?", [t.id]);
      await conn.query("UPDATE admin_invites SET used_at = ? WHERE admin_id = ? AND used_at IS NULL", [toDbTime(now), t.id]);
      await appendAudit(conn, { actor, action: "admin.disabled", objectType: "admin", objectId: t.id }, now);
    },
  );
}

export async function enableAdmin(actor: string, adminId: number, now: Date = new Date()): Promise<ManageResult> {
  return manage(
    actor,
    adminId,
    () => true,
    async (conn, t) => {
      if (!t.disabled) throw new Abort<ManageResult>({ ok: false, error: "state" });
      await conn.query("UPDATE admins SET disabled_at = NULL WHERE id = ?", [t.id]);
      await appendAudit(conn, { actor, action: "admin.enabled", objectType: "admin", objectId: t.id }, now);
      // Still without a password (never accepted, or reset): a fresh invitation.
      if (t.pending) await enqueue(conn, "admin-invite", `admin:${t.id}:invite:enabled:${now.getTime()}`, { adminId: t.id }, now);
    },
  );
}

/**
 * Phone lost, or a password forgotten: password, app and recovery codes are
 * cleared and a new invitation goes out. Sessions end at once.
 */
export async function resetAdmin(actor: string, adminId: number, now: Date = new Date()): Promise<ManageResult> {
  return manage(
    actor,
    adminId,
    () => false,
    async (conn, t) => {
      if (t.disabled) throw new Abort<ManageResult>({ ok: false, error: "state" });
      await conn.query("UPDATE admins SET password_hash = NULL, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = ?", [t.id]);
      await conn.query("DELETE FROM admin_sessions WHERE admin_id = ?", [t.id]);
      await conn.query("DELETE FROM admin_recovery_codes WHERE admin_id = ?", [t.id]);
      await enqueue(conn, "admin-invite", `admin:${t.id}:invite:reset:${now.getTime()}`, { adminId: t.id }, now);
      await appendAudit(conn, { actor, action: "admin.reset", objectType: "admin", objectId: t.id }, now);
    },
  );
}

/** The invitation once more, for someone who has not accepted it yet. */
export async function resendInvite(actor: string, adminId: number, now: Date = new Date()): Promise<ManageResult> {
  return manage(
    actor,
    adminId,
    (t) => t.role === "eigenaar",
    async (conn, t) => {
      if (!t.pending || t.disabled) throw new Abort<ManageResult>({ ok: false, error: "state" });
      await enqueue(conn, "admin-invite", `admin:${t.id}:invite:resent:${now.getTime()}`, { adminId: t.id }, now);
      await appendAudit(conn, { actor, action: "admin.invite-resent", objectType: "admin", objectId: t.id }, now);
    },
  );
}

// ---------------------------------------------------------------- reading

export type AdminListRow = {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: "active" | "invited" | "disabled";
  createdAt: Date;
  lastSeenAt: Date | null;
  inviteExpiresAt: Date | null;
};

export async function listAdmins(db: Queryable): Promise<AdminListRow[]> {
  const rows = await selectRows<{ id: number | string; email: string; name: string; role: string; disabled_at: string | null; pending: number | string; created_at: string; last_seen: string | null; invite_expires: string | null }>(
    db,
    `SELECT a.id, a.email, a.name, a.role, a.disabled_at, a.password_hash IS NULL AS pending, a.created_at,
            (SELECT MAX(s.last_seen_at) FROM admin_sessions s WHERE s.admin_id = a.id) AS last_seen,
            (SELECT MAX(i.expires_at) FROM admin_invites i WHERE i.admin_id = a.id AND i.used_at IS NULL) AS invite_expires
       FROM admins a ORDER BY a.disabled_at IS NOT NULL, a.id`,
  );
  return rows.flatMap((r) =>
    isRole(r.role)
      ? [
          {
            id: Number(r.id),
            email: r.email,
            name: r.name,
            role: r.role,
            status: r.disabled_at !== null ? "disabled" : Number(r.pending) === 1 ? "invited" : "active",
            createdAt: fromDbTime(r.created_at),
            lastSeenAt: r.last_seen ? fromDbTime(r.last_seen) : null,
            inviteExpiresAt: r.invite_expires ? fromDbTime(r.invite_expires) : null,
          } satisfies AdminListRow,
        ]
      : [],
  );
}

export type AccountView = { id: number; email: string; name: string; role: Role; sessions: number; recoveryCodesLeft: number };

export async function readAccount(db: Queryable, adminId: number): Promise<AccountView | null> {
  const [a] = await selectRows<{ id: number | string; email: string; name: string; role: string; sessions: number | string; codes: number | string }>(
    db,
    `SELECT a.id, a.email, a.name, a.role,
            (SELECT COUNT(*) FROM admin_sessions s WHERE s.admin_id = a.id) AS sessions,
            (SELECT COUNT(*) FROM admin_recovery_codes c WHERE c.admin_id = a.id AND c.used_at IS NULL) AS codes
       FROM admins a WHERE a.id = ? AND a.disabled_at IS NULL`,
    [adminId],
  );
  if (!a || !isRole(a.role)) return null;
  return { id: Number(a.id), email: a.email, name: a.name, role: a.role, sessions: Number(a.sessions), recoveryCodesLeft: Number(a.codes) };
}

/** Ten new recovery codes, the old ones stop working; asks for a code from the app first. */
export async function renewRecoveryCodes(adminId: number, code: unknown, now: Date = new Date()): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: "code" | "not-configured" }> {
  let key: Buffer;
  try {
    key = adminKey();
  } catch {
    return { ok: false, error: "not-configured" };
  }
  return inTransaction(async (conn) => {
    const [a] = await selectRows<{ totp_secret_enc: string | null; totp_last_step: number | string | null }>(conn, "SELECT totp_secret_enc, totp_last_step FROM admins WHERE id = ? AND disabled_at IS NULL FOR UPDATE", [adminId]);
    const secret = a?.totp_secret_enc ? decryptText(a.totp_secret_enc, `totp:${adminId}`, key) : null;
    const step = secret ? matchTotp(secret, text(code, 20).trim(), now, a?.totp_last_step === null || a?.totp_last_step === undefined ? null : Number(a.totp_last_step)) : null;
    if (step === null) throw new Abort({ ok: false, error: "code" } as const);
    await conn.query("UPDATE admins SET totp_last_step = ? WHERE id = ?", [step, adminId]);
    const codes = newRecoveryCodes();
    await conn.query("DELETE FROM admin_recovery_codes WHERE admin_id = ?", [adminId]);
    for (const c of codes) await conn.query("INSERT INTO admin_recovery_codes (admin_id, code_hash) VALUES (?, ?)", [adminId, recoveryHash(normalizeRecoveryCode(c)!)]);
    await appendAudit(conn, { actor: actorOf(adminId), action: "admin.recovery-renewed", objectType: "admin", objectId: adminId }, now);
    return { ok: true, recoveryCodes: codes } as const;
  });
}

/** For a mail about an admin: who, at which address — only for the mails below, never for a list. */
export async function adminForMail(db: Queryable, adminId: number): Promise<{ email: string; name: string; role: Role; pending: boolean; disabled: boolean } | null> {
  const [a] = await selectRows<{ email: string; name: string; role: string; pending: number | string; disabled_at: string | null }>(
    db,
    "SELECT email, name, role, password_hash IS NULL AS pending, disabled_at FROM admins WHERE id = ?",
    [adminId],
  );
  if (!a || !isRole(a.role)) return null;
  return { email: a.email, name: a.name, role: a.role, pending: Number(a.pending) === 1, disabled: a.disabled_at !== null };
}
