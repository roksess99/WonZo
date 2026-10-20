"use client";

import { useActionState, useId, useState } from "react";
import { inviteAction, type ManageState } from "@/app/beheer/beheerders/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { ROLES, type Role } from "@/lib/admin/permissions";
import { manageError } from "./AdminRowActions";
import { primaryButton } from "./fields";

/** A new admin: name, address and role. The values stay when it fails; after success the form is empty again. */
export function InviteAdminForm({ m, roles, hints }: { m: AdminMessages["admins"]; roles: AdminMessages["roles"]; hints: AdminMessages["roleHints"] }) {
  const id = useId();
  const [values, setValues] = useState({ name: "", email: "", role: "boekhouder" as Role });
  const [state, action, busy] = useActionState<ManageState, FormData>(async (prev, form) => {
    const next = await inviteAction(prev, form);
    if (next.ok) setValues({ name: "", email: "", role: "boekhouder" });
    return next;
  }, { ok: null });
  const error = manageError(state, m);
  const input = "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-foreground";
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="font-medium">
          {m.inviteName}
        </label>
        <input id={`${id}-name`} name="name" required maxLength={80} autoComplete="off" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className={input} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-email`} className="font-medium">
          {m.inviteEmail}
        </label>
        <input id={`${id}-email`} name="email" type="email" required maxLength={254} autoComplete="off" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className={input} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{m.inviteRole}</legend>
        {ROLES.map((r) => (
          <label key={r} className="flex min-h-11 items-start gap-3">
            <input type="radio" name="role" value={r} checked={values.role === r} onChange={() => setValues({ ...values, role: r })} className="mt-1 size-5" />
            <span>
              <span className="font-medium">{roles[r]}</span>
              <span className="block text-body-sm text-muted">{hints[r]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <button type="submit" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()} className={primaryButton}>
          {m.inviteSubmit}
        </button>
      </div>
      <p role="status" className={`text-body-sm ${error ? "font-medium text-danger" : "text-success"}`}>
        {error ?? (state.ok ? m.inviteDone : "")}
      </p>
    </form>
  );
}
