"use server";

// Searching invoices (docs/BEHEER.md § Facturen). A POST on purpose: a name or
// an e-mail address in a URL ends up in logs (.claude/rules/beveiliging.md §
// Persoonsgegevens en logging). Checks its own permission: a server action is
// its own way in.

import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { getPool } from "@/lib/db";
import { searchInvoices, type InvoiceListRow } from "@/lib/invoices";

export type InvoiceSearchState = { kind: "idle" } | { kind: "invalid" } | { kind: "results"; rows: InvoiceListRow[] } | { kind: "denied" };

export async function searchInvoicesAction(_: InvoiceSearchState, form: FormData): Promise<InvoiceSearchState> {
  try {
    await requireAction("facturen");
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { kind: "denied" };
    throw err;
  }
  const rows = await searchInvoices(getPool(), String(form.get("zoek") ?? ""));
  return rows ? { kind: "results", rows } : { kind: "invalid" };
}
