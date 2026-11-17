"use server";

// Logging in and out, the first owner, accepting an invitation, and one's
// own account (D-07, src/lib/admin/auth.ts). The session cookie is set only
// here: HttpOnly, Secure, SameSite=Lax, __Host- (path /, no domain), and as
// long as the session can live at most. Next.js compares the Origin of a
// server action with the host: the CSRF check.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminAccessDenied, requireAdmin } from "@/lib/admin/access";
import { acceptInvite, login, logout, logoutEverywhere, renewRecoveryCodes, setupFirstOwner, type NewAccountResult } from "@/lib/admin/auth";
import { SESSION_COOKIE, SESSION_MAX_MS } from "@/lib/admin/policy";
import { hasDatabase } from "@/lib/db";
import { visitorKeyOf } from "@/lib/http";

async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: Math.floor(SESSION_MAX_MS / 1000) });
}

const visitor = async () => visitorKeyOf(await headers());
const field = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").slice(0, max);

export type LoginState = { error: null | "invalid" | "rate-limit" | "not-configured"; email: string };

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  // Only the e-mail address comes back into the form; password and code never.
  const email = field(form, "email", 254);
  if (!hasDatabase) return { error: "not-configured", email };
  const result = await login({ email, password: form.get("password"), code: form.get("code"), visitor: await visitor() });
  if (!result.ok) return { error: result.error, email };
  await setSessionCookie(result.token);
  redirect("/beheer");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (hasDatabase) await logout(token);
  jar.delete(SESSION_COOKIE);
  redirect("/beheer/inloggen?uitgelogd=1");
}

export async function logoutEverywhereAction(): Promise<void> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    if (err instanceof AdminAccessDenied) redirect("/beheer/inloggen");
    throw err;
  }
  const id = Number(admin.id);
  if (Number.isSafeInteger(id)) await logoutEverywhere(id, admin.actor);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/beheer/inloggen?uitgelogd=1");
}

/** A new account: the form again with an error (values kept, never the password), or the recovery codes once. */
export type NewAccountState = { kind: "form"; error: Exclude<NewAccountResult, { ok: true }>["error"] | null; name: string; email: string } | { kind: "done"; codes: string[] };

async function finish(result: NewAccountResult, name: string, email: string): Promise<NewAccountState> {
  if (!result.ok) return { kind: "form", error: result.error, name, email };
  await setSessionCookie(result.token);
  return { kind: "done", codes: result.recoveryCodes };
}

export async function setupAction(_: NewAccountState, form: FormData): Promise<NewAccountState> {
  const name = field(form, "name", 80);
  const email = field(form, "email", 254);
  if (!hasDatabase) return { kind: "form", error: "not-configured", name, email };
  const result = await setupFirstOwner({ setupToken: form.get("setupToken"), email, name, password: form.get("password"), pending: form.get("pending"), code: form.get("code"), visitor: await visitor() });
  return finish(result, name, email);
}

export async function acceptInviteAction(_: NewAccountState, form: FormData): Promise<NewAccountState> {
  if (!hasDatabase) return { kind: "form", error: "not-configured", name: "", email: "" };
  const result = await acceptInvite({ token: form.get("token"), password: form.get("password"), pending: form.get("pending"), code: form.get("code"), visitor: await visitor() });
  return finish(result, "", "");
}

export type RenewState = { kind: "form"; error: null | "code" | "not-configured" | "access" } | { kind: "done"; codes: string[] };

export async function renewCodesAction(_: RenewState, form: FormData): Promise<RenewState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { kind: "form", error: "access" };
    throw err;
  }
  const id = Number(admin.id);
  if (!Number.isSafeInteger(id)) return { kind: "form", error: "access" };
  const result = await renewRecoveryCodes(id, form.get("code"));
  return result.ok ? { kind: "done", codes: result.recoveryCodes } : { kind: "form", error: result.error };
}
