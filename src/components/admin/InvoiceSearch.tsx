"use client";

import { useActionState, useState } from "react";
import { searchInvoicesAction, type InvoiceSearchState } from "@/app/beheer/facturen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { InvoiceTable } from "./InvoiceTable";

/** By invoice number, order number, name, e-mail address or amount (docs/BEHEER.md § Facturen). */
export function InvoiceSearch({ m, busy, denied, showOrders }: { m: AdminMessages["invoices"]; busy: string; denied: string; showOrders: boolean }) {
  const [state, action, pending] = useActionState<InvoiceSearchState, FormData>(searchInvoicesAction, { kind: "idle" });
  // Controlled, so React's reset after a form action does not empty it (docs/BEHEER.md: a failed form keeps its values).
  const [term, setTerm] = useState("");
  const message = state.kind === "invalid" ? m.searchInvalid : state.kind === "denied" ? denied : state.kind === "results" && !state.rows.length ? m.searchNone : null;
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label htmlFor="factuur-zoek" className="font-medium">
            {m.searchLabel}
          </label>
          <input
            id="factuur-zoek"
            name="zoek"
            type="search"
            autoComplete="off"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-describedby="factuur-zoek-hint factuur-zoek-status"
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-foreground"
          />
          <p id="factuur-zoek-hint" className="text-body-sm text-muted">
            {m.searchHint}
          </p>
        </div>
        <button type="submit" aria-disabled={pending} className="mb-7 min-h-11 rounded-md bg-accent px-5 font-bold text-accent-contrast hover:brightness-95">
          {pending ? busy : m.searchButton}
        </button>
      </form>
      <p id="factuur-zoek-status" role="status" className="text-body-sm">
        {message}
      </p>
      {state.kind === "results" && state.rows.length ? <InvoiceTable rows={state.rows} m={m} showOrders={showOrders} caption={m.searchResults} /> : null}
    </div>
  );
}
