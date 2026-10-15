// How an audit line reads in the panel: the action and the actor in words,
// and what changed in a short "field: before → after" — field names and
// amounts only, never a customer's details (.claude/rules/beveiliging.md §
// Auditlog). Pure.

import type { AdminMessages } from "@/lib/admin/messages";
import { formatMoney, money } from "@/lib/money";

export function auditAction(m: AdminMessages, action: string): string {
  return (m.audit.actions as Record<string, string>)[action] ?? action;
}

export function auditActor(m: AdminMessages, actor: string): string {
  if (actor === "dev" || actor === "admin:dev") return m.audit.actorDev;
  return (m.audit.actors as Record<string, string>)[actor] ?? actor;
}

const show = (key: string, v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && /Cents$/.test(key) && Number.isSafeInteger(v)) return formatMoney(money(v));
  if (Array.isArray(v)) return v.map((x) => show("", x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** "status: PAID → CANCELLED · amountCents: € 24,45". Keys stay as they are: the owner can ask what one means. */
export function auditChange(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .map((k) => {
      const b = before && k in before ? show(k, before[k]) : null;
      const a = after && k in after ? show(k, after[k]) : null;
      return b !== null && a !== null ? `${k}: ${b} → ${a}` : `${k}: ${a ?? b}`;
    })
    .join(" · ");
}
