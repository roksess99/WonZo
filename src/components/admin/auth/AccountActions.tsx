"use client";

import { useActionState, useId, useState } from "react";
import { logoutEverywhereAction, renewCodesAction, type RenewState } from "@/app/beheer/inloggen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { dangerButton, Field, plainButton, primaryButton } from "./fields";
import { RecoveryCodes } from "./RecoveryCodes";

/** "Log out everywhere", with a confirmation: it ends this session too. */
export function LogoutEverywhere({ m }: { m: AdminMessages["account"] }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${plainButton} text-danger`}>
        {m.logoutAll}
      </button>
    );
  return (
    <form action={logoutEverywhereAction} className="flex flex-col gap-2 rounded-md border-l-4 border-warning bg-warning-soft p-3">
      <p className="font-medium">{m.logoutAllText}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={dangerButton}>
          {m.logoutAllConfirm}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 underline underline-offset-4">
          {m.cancel}
        </button>
      </div>
    </form>
  );
}

/** New recovery codes, confirmed with a code from the app; shown once. */
export function RenewCodes({ m, credentials }: { m: AdminMessages["account"]; credentials: AdminMessages["credentials"] }) {
  const id = useId();
  const [state, action, busy] = useActionState<RenewState, FormData>(renewCodesAction, { kind: "form", error: null });
  if (state.kind === "done") return <RecoveryCodes codes={state.codes} m={credentials} href="/beheer/account" next={credentials.codesConfirm} />;
  const error = state.error === "code" ? m.renewError : state.error === "not-configured" ? m.notConfigured : state.error === "access" ? m.renewError : null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <p>{m.renewText}</p>
      <Field
        id={`${id}-code`}
        label={m.renewCode}
        error={error}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        required
        maxLength={6}
        className="min-h-11 w-32 rounded-md border border-border bg-surface px-3 font-mono tabular-nums text-foreground"
      />
      <div>
        <button type="submit" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()} className={primaryButton}>
          {busy ? credentials.busy : m.renewSubmit}
        </button>
      </div>
    </form>
  );
}
