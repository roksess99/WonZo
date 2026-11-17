"use client";

import { useActionState, useId } from "react";
import { loginAction, type LoginState } from "@/app/beheer/inloggen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { Field, primaryButton } from "./fields";

/**
 * Mail address, password and code in one form (.claude/rules/beveiliging.md
 * § Authenticatie): there is no half-logged-in state. One message for every
 * miss. The address stays after a failure; password and code never do.
 */
export function LoginForm({ m }: { m: AdminMessages["login"] }) {
  const id = useId();
  const [state, action, busy] = useActionState<LoginState, FormData>(loginAction, { error: null, email: "" });
  const error = state.error === "invalid" ? m.invalid : state.error === "rate-limit" ? m.rateLimit : state.error === "not-configured" ? m.notConfigured : null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id={`${id}-email`} label={m.email} name="email" type="email" autoComplete="username" required maxLength={254} defaultValue={state.email} />
      <Field id={`${id}-password`} label={m.password} name="password" type="password" autoComplete="current-password" required maxLength={800} />
      <Field
        id={`${id}-code`}
        label={m.code}
        hint={m.codeHint}
        name="code"
        type="text"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={20}
        className="min-h-11 w-40 rounded-md border border-border bg-surface px-3 font-mono tabular-nums text-foreground"
      />
      <p role="alert" className="text-body-sm font-medium text-danger empty:hidden">
        {error}
      </p>
      <div>
        <button type="submit" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()} className={primaryButton}>
          {busy ? m.busy : m.submit}
        </button>
      </div>
    </form>
  );
}
