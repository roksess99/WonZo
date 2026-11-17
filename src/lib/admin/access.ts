// Who is asking, and may they (D-07, .claude/rules/beveiliging.md §
// Autorisatie). Every admin page, server action and route handler calls one
// of the require* functions itself: a layout protects nothing (a server
// action and a route handler are their own way in), and a forgotten check
// looks exactly like one that works. Server-side only.

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { can, type Permission, type Role } from "./permissions";

if (typeof window !== "undefined") throw new Error("Admin access is decided on the server");

export type Admin = {
  id: string;
  name: string;
  role: Role;
  /** How this admin appears in the audit log and the order history. */
  actor: string;
};

/** The admin on a development machine, until logging in exists (D-07). */
const LOCAL_DEVELOPER: Admin = { id: "dev", name: "Lokaal (ontwikkeling)", role: "eigenaar", actor: "admin:dev" };

/** localhost, 127.0.0.1 or [::1], with or without a port. */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
  return ["localhost", "127.0.0.1", "[::1]"].includes(name.toLowerCase());
}

/**
 * The panel without logging in, only while logging in is not built (D-07,
 * owner 2026-10-12): `pnpm dev`, ADMIN_DEV_LOGIN=true and a localhost
 * address, all three. A production build never has NODE_ENV=development.
 * The host is a header the client sends: on its own it proves nothing, which
 * is why it is the third condition and never the only one.
 */
export function devLoginAllowed(env: Record<string, string | undefined>, host: string | null | undefined): boolean {
  return env.NODE_ENV === "development" && env.ADMIN_DEV_LOGIN === "true" && isLocalHost(host);
}

/** The admin of this request, or null. */
export async function currentAdmin(): Promise<Admin | null> {
  const h = await headers();
  if (devLoginAllowed(process.env, h.get("host"))) return LOCAL_DEVELOPER;
  // TODO fase 6a: the session from the cookie (password + TOTP, D-07).
  return null;
}

/**
 * For a page. Not an admin: "not found" — until logging in exists, the panel
 * does not exist for anyone else (6a: to the login page instead). An admin
 * without this permission goes to the dashboard with an explanation, not to a
 * login page: they are logged in, they just may not be here.
 */
export async function requirePage(permission: Permission | null): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  if (permission && !can(admin.role, permission)) redirect(`/beheer?geen-toegang=${permission}`);
  return admin;
}

export class AdminAccessDenied extends Error {}

/** The decision itself: this admin (or nobody), this permission. Throws when not allowed. */
export function authorize(admin: Admin | null, permission: Permission): Admin {
  if (!admin || !can(admin.role, permission)) throw new AdminAccessDenied(permission);
  return admin;
}

/** For a server action or route handler: throws, so nothing after it runs. */
export async function requireAction(permission: Permission): Promise<Admin> {
  return authorize(await currentAdmin(), permission);
}
