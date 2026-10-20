"use server";

// Managing admins (D-07): invite, change a role, disable, enable, reset,
// send the invitation again. Each checks the permission "beheerders" itself —
// a server action is its own way in; only the owner's role has it. The rules
// (never yourself, never the last owner) are in src/lib/admin/auth.ts, in
// the same transaction as the change.

import { revalidatePath } from "next/cache";
import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { changeRole, disableAdmin, enableAdmin, inviteAdmin, resendInvite, resetAdmin, type ManageResult } from "@/lib/admin/auth";

export type ManageState = { ok: null } | ManageResult | { ok: false; error: "access" };

const id = (x: FormDataEntryValue | null) => {
  const n = Number(x);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};

async function run(act: (actor: string) => Promise<ManageResult>): Promise<ManageState> {
  let actor: string;
  try {
    actor = (await requireAction("beheerders")).actor;
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { ok: false, error: "access" };
    throw err;
  }
  const result = await act(actor);
  revalidatePath("/beheer/beheerders");
  return result;
}

export async function inviteAction(_: ManageState, form: FormData): Promise<ManageState> {
  return run((actor) => inviteAdmin(actor, { email: form.get("email"), name: form.get("name"), role: form.get("role") }));
}

export async function roleAction(_: ManageState, form: FormData): Promise<ManageState> {
  return run((actor) => changeRole(actor, id(form.get("adminId")), form.get("role")));
}

export async function disableAction(_: ManageState, form: FormData): Promise<ManageState> {
  return run((actor) => disableAdmin(actor, id(form.get("adminId"))));
}

export async function enableAction(_: ManageState, form: FormData): Promise<ManageState> {
  return run((actor) => enableAdmin(actor, id(form.get("adminId"))));
}

export async function resetAction(_: ManageState, form: FormData): Promise<ManageState> {
  return run((actor) => resetAdmin(actor, id(form.get("adminId"))));
}

export async function resendAction(_: ManageState, form: FormData): Promise<ManageState> {
  return run((actor) => resendInvite(actor, id(form.get("adminId"))));
}
