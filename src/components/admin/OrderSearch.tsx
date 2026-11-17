"use client";

import { useActionState, useState } from "react";
import { searchAction, type SearchState } from "@/app/beheer/bestellingen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { OrderTable } from "./OrderTable";

/** By order number or e-mail address: the two things a customer calls with (docs/BEHEER.md § De lijst). */
export function OrderSearch({ m }: { m: AdminMessages }) {
  const [state, action, pending] = useActionState<SearchState, FormData>(searchAction, { kind: "idle" });
  // Controlled, so React's reset after a form action does not empty it (docs/BEHEER.md: a failed form keeps its values).
  const [term, setTerm] = useState("");
  const message =
    state.kind === "invalid" ? m.orders.searchInvalid : state.kind === "denied" ? m.actions.errorAccess : state.kind === "results" && !state.rows.length ? m.orders.searchNone : null;
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label htmlFor="zoek" className="font-medium">
            {m.orders.searchLabel}
          </label>
          <input
            id="zoek"
            name="zoek"
            type="search"
            autoComplete="off"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-describedby="zoek-hint zoek-status"
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-foreground"
          />
          <p id="zoek-hint" className="text-body-sm text-muted">
            {m.orders.searchHint}
          </p>
        </div>
        <button type="submit" aria-disabled={pending} className="mb-7 min-h-11 rounded-md bg-accent px-5 font-bold text-accent-contrast hover:brightness-95">
          {pending ? m.actions.busy : m.orders.searchButton}
        </button>
      </form>
      <p id="zoek-status" role="status" className="text-body-sm">
        {message}
      </p>
      {state.kind === "results" && state.rows.length ? <OrderTable rows={state.rows} m={m} caption={m.orders.searchResults} /> : null}
    </div>
  );
}
