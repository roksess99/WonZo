"use server";

// The admin's actions on reviews (D-12): answer, hide (with a reason), show
// again. Each checks the permission "beoordelingen" itself — a server action is
// its own way in. Next.js compares the Origin with the host: the CSRF check.

import { revalidatePath } from "next/cache";
import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { replyToReview, setReviewVisibility, type ReviewActionResult } from "@/lib/reviews";

export type ReviewActionState = { ok: null } | ReviewActionResult | { ok: false; error: "access" };

const id = (x: FormDataEntryValue | null) => {
  const n = Number(x);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function run(form: FormData, act: (actor: string, reviewId: number) => Promise<ReviewActionResult>): Promise<ReviewActionState> {
  let actor: string;
  try {
    actor = (await requireAction("beoordelingen")).actor;
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { ok: false, error: "access" };
    throw err;
  }
  const reviewId = id(form.get("reviewId"));
  if (!reviewId) return { ok: false, error: "not-found" };
  const result = await act(actor, reviewId);
  revalidatePath("/beheer/beoordelingen");
  return result;
}

export async function replyAction(_: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  return run(form, (actor, reviewId) => replyToReview({ reviewId, reply: form.get("reply"), actor }));
}

export async function hideAction(_: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  return run(form, (actor, reviewId) => setReviewVisibility({ reviewId, hide: true, reason: form.get("reason"), actor }));
}

export async function showAction(_: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  return run(form, (actor, reviewId) => setReviewVisibility({ reviewId, hide: false, reason: form.get("reason"), actor }));
}
