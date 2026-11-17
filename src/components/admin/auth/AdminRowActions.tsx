"use client";

import { useActionState, useId, useState } from "react";
import { disableAction, enableAction, resendAction, resetAction, roleAction, type ManageState } from "@/app/beheer/beheerders/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { ROLES, type Role } from "@/lib/admin/permissions";
import { interpolate } from "@/lib/text";
import { dangerButton, plainButton, primaryButton } from "./fields";

type Labels = AdminMessages["admins"];

export function manageError(s: ManageState, m: Labels): string | null {
  return s.ok === false ? m.errors[s.error] : null;
}

/** One change with its own confirmation, saying what will happen to whom (docs/BEHEER.md § Hoe een beheerscherm eruitziet). */
function Confirmed({
  adminId,
  action,
  label,
  text,
  confirm,
  done,
  danger,
  m,
  extra,
}: {
  adminId: number;
  action: (s: ManageState, f: FormData) => Promise<ManageState>;
  label: string;
  text: string;
  confirm: string;
  done: string;
  danger?: boolean;
  m: Labels;
  extra?: { name: string; value: string };
}) {
  const [open, setOpen] = useState(false);
  const [state, act, busy] = useActionState<ManageState, FormData>(action, { ok: null });
  const error = manageError(state, m);
  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${plainButton} ${danger ? "text-danger" : ""}`}>
          {label}
        </button>
      ) : (
        <form action={act} className={`flex flex-col gap-2 rounded-md p-3 ${danger ? "border-l-4 border-warning bg-warning-soft" : "bg-background"}`}>
          <input type="hidden" name="adminId" value={adminId} />
          {extra ? <input type="hidden" name={extra.name} value={extra.value} /> : null}
          <p className="font-medium">{text}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()} className={danger ? dangerButton : primaryButton}>
              {confirm}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 underline underline-offset-4">
              {m.cancel}
            </button>
          </div>
        </form>
      )}
      <p role="status" className={`text-body-sm ${error ? "font-medium text-danger" : "text-success"}`}>
        {error ?? (state.ok ? done : "")}
      </p>
    </div>
  );
}

/** The changes an owner can make to another admin. Never to themselves: the server refuses that too. */
export function AdminRowActions({ admin, m, roles }: { admin: { id: number; name: string; role: Role; status: "active" | "invited" | "disabled" }; m: Labels; roles: AdminMessages["roles"] }) {
  const id = useId();
  const [role, setRole] = useState<Role>(admin.role);
  const v = { name: admin.name, role: roles[role].toLowerCase() };
  return (
    <div className="flex flex-col gap-3">
      {admin.status !== "disabled" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-role`} className="text-body-sm font-medium">
              {interpolate(m.roleLabel, { name: admin.name })}
            </label>
            <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value as Role)} className="min-h-11 rounded-md border border-border bg-surface px-3 text-foreground">
              {ROLES.map((r) => (
                <option key={r} value={r} className="bg-surface text-foreground">
                  {roles[r]}
                </option>
              ))}
            </select>
          </div>
          {role !== admin.role ? <Confirmed adminId={admin.id} action={roleAction} label={m.roleSave} text={interpolate(m.roleText, v)} confirm={m.roleConfirm} done={m.roleDone} m={m} extra={{ name: "role", value: role }} /> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {admin.status === "invited" ? <Confirmed adminId={admin.id} action={resendAction} label={m.resend} text={interpolate(m.resendText, v)} confirm={m.resend} done={m.resendDone} m={m} /> : null}
        {admin.status === "active" ? <Confirmed adminId={admin.id} action={resetAction} label={m.reset} text={interpolate(m.resetText, v)} confirm={m.resetConfirm} done={m.resetDone} danger m={m} /> : null}
        {admin.status === "disabled" ? (
          <Confirmed adminId={admin.id} action={enableAction} label={m.enable} text={interpolate(m.enableText, v)} confirm={m.enable} done={m.enableDone} m={m} />
        ) : (
          <Confirmed adminId={admin.id} action={disableAction} label={m.disable} text={interpolate(m.disableText, v)} confirm={m.disableConfirm} done={m.disableDone} danger m={m} />
        )}
      </div>
    </div>
  );
}
