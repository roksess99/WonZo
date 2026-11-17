// Logging in to the panel against the test database (D-07, owner
// 2026-10-19; .claude/rules/beveiliging.md § Authenticatie, § Sessies): the
// setup page that closes itself, one form with password and code, one
// message for every miss, no replay, recovery codes once, the limits, the
// session times, and managing admins with the three authorisation cases.
// The test database keeps its rows between runs: every test makes its own
// admins with a fresh address.

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "wonzo.test" }),
  cookies: async () => ({ get: () => (jar.token ? { value: jar.token } : undefined), set: () => undefined, delete: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// The key and setup token of these tests, whatever .env says for the dev shop.
process.env.ADMIN_TOTP_KEY = "5a".repeat(32);
process.env.ADMIN_SETUP_TOKEN = "test-setup-token-".padEnd(40, "x");

import { disableAction, roleAction } from "@/app/beheer/beheerders/actions";
import {
  acceptInvite,
  changeRole,
  disableAdmin,
  inviteAdmin,
  issueInvite,
  login,
  logoutEverywhere,
  readInvite,
  readSession,
  resetAdmin,
  setupFirstOwner,
  setupOpen,
} from "@/lib/admin/auth";
import { adminKey, base32Decode, newTotpSecret, sealPending, sha256, totpCode, totpStep } from "@/lib/admin/crypto";
import { SESSION_IDLE_MS, SESSION_MAX_MS } from "@/lib/admin/policy";
import type { Role } from "@/lib/admin/permissions";
import { getPool, selectRows, withTransaction } from "@/lib/db";

const PASSWORD = "een lange testzin voor het paneel";
const codeAt = (secret: string, at: Date) => totpCode(base32Decode(secret)!, totpStep(at));
const visitor = () => randomUUID().replace(/-/g, "");
/** Steps of 30 s apart, so every login has a code of its own. */
const later = (base: Date, steps: number) => new Date(base.getTime() + steps * 30_000);

type TestAdmin = { id: number; email: string; secret: string; session: string; codes: string[] };

/** A new admin the way the owner makes one: invite, the key the mail would carry, accept. */
async function makeAdmin(role: Role, now: Date, actor = "system"): Promise<TestAdmin> {
  const email = `t-${randomUUID()}@test.wonzo.nl`;
  expect(await inviteAdmin(actor, { email, name: `Test ${role}`, role }, now)).toEqual({ ok: true });
  const [a] = await selectRows<{ id: number | string }>(getPool(), "SELECT id FROM admins WHERE email = ?", [email]);
  const id = Number(a!.id);
  const invite = await withTransaction((conn) => issueInvite(conn, id, now));
  const secret = newTotpSecret();
  const pending = sealPending(secret, `invite:${sha256(invite!.token)}`, now, adminKey());
  const result = await acceptInvite({ token: invite!.token, password: PASSWORD, pending, code: codeAt(secret, now), visitor: visitor() }, now);
  if (!result.ok) throw new Error(`accept failed: ${result.error}`);
  return { id, email, secret, session: result.token, codes: result.recoveryCodes };
}

const audits = async (id: number, action: string) =>
  Number((await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM audit_log WHERE object_type = 'admin' AND object_id = ? AND action = ?", [String(id), action]))[0]?.n ?? 0);

beforeEach(() => {
  jar.token = undefined;
});

afterAll(async () => {
  await getPool().end();
});

describe("the setup page", () => {
  it("is open only until the first admin exists, and then closed in the database for good", async () => {
    const now = new Date();
    const secret = newTotpSecret();
    const input = (setupToken: string) => ({
      setupToken,
      email: `eigenaar-${randomUUID()}@test.wonzo.nl`,
      name: "Eerste eigenaar",
      password: PASSWORD,
      pending: sealPending(secret, "setup", now, adminKey()),
      code: codeAt(secret, now),
      visitor: visitor(),
    });
    if (await setupOpen()) {
      expect(await setupFirstOwner(input("wrong-token".padEnd(40, "y")), now)).toEqual({ ok: false, error: "setup-token" });
      const first = await setupFirstOwner(input(process.env.ADMIN_SETUP_TOKEN!), now);
      expect(first.ok).toBe(true);
    }
    expect(await setupOpen()).toBe(false);
    // Even with the right key and a valid code: closed.
    expect(await setupFirstOwner(input(process.env.ADMIN_SETUP_TOKEN!), later(now, 1))).toEqual({ ok: false, error: "closed" });
  });
});

describe("logging in", () => {
  it("mail, password and code in one form; one message for every miss; a code works once", async () => {
    const t0 = new Date();
    const a = await makeAdmin("eigenaar", t0);
    const t1 = later(t0, 2);
    const v = visitor();
    const attempt = (over: Partial<{ email: string; password: string; code: string }>, at = t1) =>
      login({ email: a.email, password: PASSWORD, code: codeAt(a.secret, at), visitor: v, ...over }, at);

    expect(await attempt({ password: "een ander wachtwoord" })).toEqual({ ok: false, error: "invalid" });
    expect(await attempt({ email: `niemand-${randomUUID()}@test.wonzo.nl` })).toEqual({ ok: false, error: "invalid" });
    expect(await attempt({ code: "000000" === codeAt(a.secret, t1) ? "111111" : "000000" })).toEqual({ ok: false, error: "invalid" });
    expect(await audits(a.id, "admin.login-failed")).toBe(2);

    const ok = await attempt({});
    expect(ok.ok).toBe(true);
    const session = ok.ok ? await readSession(getPool(), ok.token, t1) : null;
    expect(session).toMatchObject({ id: String(a.id), role: "eigenaar", actor: `admin:${a.id}` });
    expect(await audits(a.id, "admin.login")).toBe(1);

    // The same code again, in the same 30 seconds: refused (no replay).
    expect(await attempt({})).toEqual({ ok: false, error: "invalid" });
  });

  it("after five tries in a quarter the account is held back, also with the right credentials — not for good", async () => {
    const t0 = new Date();
    const a = await makeAdmin("boekhouder", t0);
    const at = later(t0, 2);
    for (let i = 0; i < 5; i++) expect(await login({ email: a.email, password: "fout", code: "123456", visitor: visitor() }, at)).toEqual({ ok: false, error: "invalid" });
    expect(await login({ email: a.email, password: PASSWORD, code: codeAt(a.secret, at), visitor: visitor() }, at)).toEqual({ ok: false, error: "rate-limit" });
    // The next quarter it works again.
    const next = new Date(Math.ceil((at.getTime() + 1) / (15 * 60_000)) * 15 * 60_000 + 1_000);
    expect((await login({ email: a.email, password: PASSWORD, code: codeAt(a.secret, next), visitor: visitor() }, next)).ok).toBe(true);
  });

  it("a recovery code works once, is in the log, and the admin gets a mail", async () => {
    const t0 = new Date();
    const a = await makeAdmin("marketing", t0);
    const at = later(t0, 2);
    const code = a.codes[0]!.toUpperCase();
    const first = await login({ email: a.email, password: PASSWORD, code, visitor: visitor() }, at);
    expect(first).toMatchObject({ ok: true, method: "recovery" });
    expect(await login({ email: a.email, password: PASSWORD, code, visitor: visitor() }, later(at, 1))).toEqual({ ok: false, error: "invalid" });
    expect(await audits(a.id, "admin.recovery-used")).toBe(1);
    const [mail] = await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM outbox WHERE kind = 'admin-recovery-used' AND JSON_VALUE(payload, '$.adminId') = ?", [String(a.id)]);
    expect(Number(mail?.n)).toBe(1);
  });
});

describe("sessions", () => {
  it("end after 30 minutes of nothing, after 12 hours however busy, and at once on logging out everywhere", async () => {
    const t0 = new Date();
    const a = await makeAdmin("boekhouder", t0);
    // Idle: 29 minutes is fine (and counts as activity), 30 more is not.
    expect(await readSession(getPool(), a.session, new Date(t0.getTime() + SESSION_IDLE_MS - 60_000))).not.toBeNull();
    expect(await readSession(getPool(), a.session, new Date(t0.getTime() + 2 * SESSION_IDLE_MS))).toBeNull();

    // Busy all day: every 25 minutes a click, and still over after 12 hours.
    const t1 = later(t0, 2);
    const busy = await login({ email: a.email, password: PASSWORD, code: codeAt(a.secret, t1), visitor: visitor() }, t1);
    if (!busy.ok) throw new Error(busy.error);
    let at = t1;
    while (at.getTime() + 25 * 60_000 < t1.getTime() + SESSION_MAX_MS) {
      at = new Date(at.getTime() + 25 * 60_000);
      expect(await readSession(getPool(), busy.token, at)).not.toBeNull();
    }
    expect(await readSession(getPool(), busy.token, new Date(t1.getTime() + SESSION_MAX_MS))).toBeNull();

    const t2 = later(t0, 4);
    const again = await login({ email: a.email, password: PASSWORD, code: codeAt(a.secret, t2), visitor: visitor() }, t2);
    if (!again.ok) throw new Error(again.error);
    await logoutEverywhere(a.id, `admin:${a.id}`, t2);
    expect(await readSession(getPool(), again.token, t2)).toBeNull();
  });
});

describe("invitations", () => {
  it("work once, for 48 hours, and a newer link replaces the older one", async () => {
    const now = new Date();
    const email = `t-${randomUUID()}@test.wonzo.nl`;
    await inviteAdmin("system", { email, name: "Nieuw", role: "boekhouder" }, now);
    const [row] = await selectRows<{ id: number | string }>(getPool(), "SELECT id FROM admins WHERE email = ?", [email]);
    const id = Number(row!.id);
    const older = await withTransaction((conn) => issueInvite(conn, id, now));
    const newer = await withTransaction((conn) => issueInvite(conn, id, now));
    expect(await readInvite(getPool(), older!.token, now)).toBeNull();
    expect(await readInvite(getPool(), newer!.token, new Date(now.getTime() + 49 * 3_600_000))).toBeNull();
    expect((await readInvite(getPool(), newer!.token, now))?.adminId).toBe(id);

    const secret = newTotpSecret();
    const accept = (at: Date) =>
      acceptInvite({ token: newer!.token, password: PASSWORD, pending: sealPending(secret, `invite:${sha256(newer!.token)}`, now, adminKey()), code: codeAt(secret, at), visitor: visitor() }, at);
    expect((await accept(now)).ok).toBe(true);
    expect(await accept(later(now, 1))).toEqual({ ok: false, error: "invalid" });
    // A second invitation for the same address: refused.
    expect(await inviteAdmin("system", { email: email.toUpperCase(), name: "Nog eens", role: "marketing" }, now)).toEqual({ ok: false, error: "exists" });
  });
});

describe("managing admins (permission beheerders)", () => {
  it("not logged in and the wrong role are refused without a change; the owner's change ends the target's sessions", async () => {
    const now = new Date();
    const owner = await makeAdmin("eigenaar", now);
    const target = await makeAdmin("boekhouder", now);
    const marketing = await makeAdmin("marketing", now);
    const form = new FormData();
    form.set("adminId", String(target.id));
    form.set("role", "marketing");
    const role = async () => (await selectRows<{ role: string }>(getPool(), "SELECT role FROM admins WHERE id = ?", [target.id]))[0]?.role;

    jar.token = undefined;
    expect(await roleAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    jar.token = marketing.session;
    expect(await roleAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    expect(await disableAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    expect(await role()).toBe("boekhouder");
    expect(await audits(target.id, "admin.role-changed")).toBe(0);

    jar.token = owner.session;
    expect(await roleAction({ ok: null }, form)).toEqual({ ok: true });
    expect(await role()).toBe("marketing");
    expect(await audits(target.id, "admin.role-changed")).toBe(1);
    // New rights, a new login.
    expect(await readSession(getPool(), target.session, now)).toBeNull();
  });

  it("never on yourself; disabling and resetting end the sessions and the old credentials", async () => {
    const now = new Date();
    const owner = await makeAdmin("eigenaar", now);
    const other = await makeAdmin("boekhouder", now);
    expect(await disableAdmin(`admin:${owner.id}`, owner.id, now)).toEqual({ ok: false, error: "self" });
    expect(await changeRole(`admin:${owner.id}`, owner.id, "marketing", now)).toEqual({ ok: false, error: "self" });

    expect(await resetAdmin(`admin:${owner.id}`, other.id, now)).toEqual({ ok: true });
    expect(await readSession(getPool(), other.session, now)).toBeNull();
    const at = later(now, 2);
    expect(await login({ email: other.email, password: PASSWORD, code: codeAt(other.secret, at), visitor: visitor() }, at)).toEqual({ ok: false, error: "invalid" });
    const [codes] = await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE admin_id = ?", [other.id]);
    expect(Number(codes?.n)).toBe(0);
    const [invite] = await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM outbox WHERE kind = 'admin-invite' AND JSON_VALUE(payload, '$.adminId') = ?", [String(other.id)]);
    expect(Number(invite?.n)).toBeGreaterThanOrEqual(2);

    const third = await makeAdmin("marketing", now);
    expect(await disableAdmin(`admin:${owner.id}`, third.id, now)).toEqual({ ok: true });
    expect(await readSession(getPool(), third.session, now)).toBeNull();
    expect(await login({ email: third.email, password: PASSWORD, code: codeAt(third.secret, at), visitor: visitor() }, at)).toEqual({ ok: false, error: "invalid" });
    expect(await disableAdmin(`admin:${owner.id}`, third.id, now)).toEqual({ ok: false, error: "state" });
  });
});
