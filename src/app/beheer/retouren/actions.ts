"use server";

// The admin's actions on returns (D-09). Each checks its own permission
// first: a server action is its own way in (.claude/rules/beveiliging.md §
// Autorisatie). Receiving and refusing need "retouren"; paying back needs
// "terugbetalen" — both stay with the owner (D-07). Next.js compares the
// Origin of a server action with the host: the CSRF check.

import { revalidatePath } from "next/cache";
import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import type { Permission } from "@/lib/admin/permissions";
import { receiveReturn, refundReturn, rejectReturn, type ReturnActionError, type ReturnActionResult } from "@/lib/returns";
import { parseEuroInput } from "@/lib/returns/amount";

export type ReturnActionState = { ok: null } | ReturnActionResult | { ok: false; error: ReturnActionError | "access" | "amount-format" };

const id = (x: FormDataEntryValue | null) => {
  const n = Number(x);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function run(permission: Permission, form: FormData, act: (actor: string, returnId: number) => Promise<ReturnActionState>): Promise<ReturnActionState> {
  let actor: string;
  try {
    actor = (await requireAction(permission)).actor;
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { ok: false, error: "access" };
    throw err;
  }
  const returnId = id(form.get("returnId"));
  if (!returnId) return { ok: false, error: "not-found" };
  const result = await act(actor, returnId);
  const orderId = id(form.get("orderId"));
  if (orderId) revalidatePath(`/beheer/bestellingen/${orderId}`);
  revalidatePath("/beheer/retouren");
  return result;
}

export async function receiveReturnAction(_: ReturnActionState, form: FormData): Promise<ReturnActionState> {
  return run("retouren", form, (actor, returnId) => receiveReturn({ returnId, expectedStatus: String(form.get("expectedStatus") ?? ""), actor }));
}

export async function rejectReturnAction(_: ReturnActionState, form: FormData): Promise<ReturnActionState> {
  return run("retouren", form, (actor, returnId) => rejectReturn({ returnId, expectedStatus: String(form.get("expectedStatus") ?? ""), reason: form.get("reason"), actor }));
}

export async function refundReturnAction(_: ReturnActionState, form: FormData): Promise<ReturnActionState> {
  const refundCents = parseEuroInput(form.get("amount"));
  const expectedMax = Number(form.get("expectedMaxCents"));
  return run("terugbetalen", form, async (actor, returnId) => {
    if (refundCents === null) return { ok: false, error: "amount-format" };
    if (!Number.isSafeInteger(expectedMax)) return { ok: false, error: "amount-changed" };
    return refundReturn({ returnId, expectedMaxCents: expectedMax, refundCents, deductionReason: form.get("deduction"), actor });
  });
}
