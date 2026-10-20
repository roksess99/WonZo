"use client";

import { useActionState, useId } from "react";
import { acceptInviteAction, setupAction, type NewAccountState } from "@/app/beheer/inloggen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import type { Enrolment } from "@/lib/admin/enrol";
import { Field, primaryButton } from "./fields";
import { RecoveryCodes } from "./RecoveryCodes";

type Props =
  | { mode: "setup"; enrolment: Enrolment; m: AdminMessages["credentials"]; setup: AdminMessages["setup"]; submit: string; doneTitle: string }
  | { mode: "invite"; token: string; enrolment: Enrolment; m: AdminMessages["credentials"]; submit: string; doneTitle: string };

/**
 * A new account in one form: (for the first owner: the setup key, name and
 * address), a password, the app linked with the QR code, and its first code
 * to prove it works. Then the recovery codes, once.
 */
export function NewAccountForm(props: Props) {
  const id = useId();
  const { m, enrolment } = props;
  const [state, action, busy] = useActionState<NewAccountState, FormData>(props.mode === "setup" ? setupAction : acceptInviteAction, { kind: "form", error: null, name: "", email: "" });
  if (state.kind === "done") {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-h2 font-bold">{props.doneTitle}</h2>
        <RecoveryCodes codes={state.codes} m={m} href="/beheer" next={`${m.codesConfirm} — ${m.toPanel}`} />
      </div>
    );
  }
  const err = state.error;
  const message = (keys: readonly string[]) => (err && keys.includes(err) ? m.errors[err as keyof typeof m.errors] : null);
  const general = message(["rate-limit", "not-configured", "closed", "invalid"]);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="pending" value={enrolment.pending} />
      {props.mode === "invite" ? <input type="hidden" name="token" value={props.token} /> : null}
      {props.mode === "setup" ? (
        <>
          <Field id={`${id}-token`} label={props.setup.tokenLabel} hint={props.setup.tokenHint} error={message(["setup-token"])} name="setupToken" type="password" autoComplete="off" required maxLength={200} />
          <Field id={`${id}-name`} label={props.setup.name} hint={props.setup.nameHint} error={message(["name"])} name="name" autoComplete="name" required maxLength={80} defaultValue={state.name} />
          <Field id={`${id}-email`} label={props.setup.email} error={message(["email"])} name="email" type="email" autoComplete="username" required maxLength={254} defaultValue={state.email} />
        </>
      ) : null}
      <Field
        id={`${id}-password`}
        label={m.passwordLabel}
        hint={m.passwordHint}
        error={message(["password-short", "password-long", "password-is-email"])}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={800}
      />
      <section aria-labelledby={`${id}-app`} className="flex flex-col gap-3">
        <h2 id={`${id}-app`} className="font-display text-h2 font-bold">
          {m.appTitle}
        </h2>
        <p>{m.appText}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URI made on the server; next/image does not optimise it */}
        <img src={enrolment.qrDataUri} alt={m.qrAlt} width={220} height={220} className="h-[220px] w-[220px]" />
        <p className="text-body-sm">{m.manual}</p>
        <p className="font-mono text-body tabular-nums break-all">{enrolment.manualKey}</p>
        <Field
          id={`${id}-code`}
          label={m.codeLabel}
          hint={m.codeHint}
          error={message(["code"])}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          required
          maxLength={6}
          className="min-h-11 w-32 rounded-md border border-border bg-surface px-3 font-mono tabular-nums text-foreground"
        />
      </section>
      <p role="alert" className="text-body-sm font-medium text-danger empty:hidden">
        {general}
      </p>
      <div>
        <button type="submit" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()} className={primaryButton}>
          {busy ? m.busy : props.submit}
        </button>
      </div>
    </form>
  );
}
