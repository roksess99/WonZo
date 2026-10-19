"use client";

import { useActionState, useId, useState } from "react";
import { hideAction, replyAction, showAction, type ReviewActionState } from "@/app/beheer/beoordelingen/actions";
import type { AdminMessages } from "@/lib/admin/messages";

type Labels = AdminMessages["reviews"];

function errorText(s: ReviewActionState, m: Labels): string | null {
  if (s.ok !== false) return null;
  switch (s.error) {
    case "reason-required":
      return m.errorReason;
    case "reply-required":
      return m.errorReply;
    case "changed":
      return m.errorChanged;
    case "not-found":
      return m.errorNotFound;
    case "access":
      return m.errorAccess;
  }
}

/**
 * Answer (the better way, docs/BEHEER.md § Beoordelingen), and hide or show
 * again — never without a reason, which goes into the audit log. Values stay
 * in the form when it fails.
 */
export function ReviewAdminActions({ reviewId, reply, hidden, m, labels }: { reviewId: number; reply: string | null; hidden: boolean; m: Labels; labels: { reasonLabel: string; back: string; busy: string } }) {
  const id = useId();
  const [text, setText] = useState(reply ?? "");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState<"reply" | "visibility" | null>(null);
  const [replyState, reply$, replying] = useActionState<ReviewActionState, FormData>(replyAction, { ok: null });
  const [visState, vis$, switching] = useActionState<ReviewActionState, FormData>(hidden ? showAction : hideAction, { ok: null });
  const button = "min-h-11 rounded-md px-4 font-medium";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setOpen(open === "reply" ? null : "reply")} aria-expanded={open === "reply"} className={`${button} bg-surface ring-1 ring-border`}>
          {m.reply}
        </button>
        <button type="button" onClick={() => setOpen(open === "visibility" ? null : "visibility")} aria-expanded={open === "visibility"} className={`${button} bg-surface ring-1 ring-border ${hidden ? "" : "text-danger"}`}>
          {hidden ? m.show : m.hide}
        </button>
      </div>
      {open === "reply" ? (
        <form action={reply$} className="flex flex-col gap-2">
          <input type="hidden" name="reviewId" value={reviewId} />
          <label htmlFor={`${id}-reply`} className="font-medium">
            {m.replyLabel}
          </label>
          <textarea id={`${id}-reply`} name="reply" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} aria-describedby={`${id}-reply-hint`} className="rounded-md border border-border bg-surface px-3 py-2 text-foreground" />
          <p id={`${id}-reply-hint`} className="text-body-sm text-muted">
            {m.replyHint}
          </p>
          <div>
            <button type="submit" aria-disabled={replying} onClick={(e) => replying && e.preventDefault()} className={`${button} bg-accent font-bold text-accent-contrast`}>
              {replying ? labels.busy : m.replySave}
            </button>
          </div>
          <p role="status" className={`text-body-sm ${errorText(replyState, m) ? "font-medium text-danger" : "text-success"}`}>
            {errorText(replyState, m) ?? (replyState.ok ? m.done : "")}
          </p>
        </form>
      ) : null}
      {open === "visibility" ? (
        <form action={vis$} className="flex flex-col gap-2 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          <input type="hidden" name="reviewId" value={reviewId} />
          <p className="font-medium">{hidden ? m.showText : m.hideText}</p>
          <label htmlFor={`${id}-reason`} className="font-medium">
            {labels.reasonLabel}
          </label>
          <textarea id={`${id}-reason`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={200} rows={2} className="rounded-md border border-border bg-surface px-3 py-2 text-foreground" />
          <div className="flex flex-wrap gap-3">
            <button type="submit" aria-disabled={switching} onClick={(e) => switching && e.preventDefault()} className={`${button} font-bold ${hidden ? "bg-accent text-accent-contrast" : "bg-danger text-on-petrol"}`}>
              {switching ? labels.busy : hidden ? m.showConfirm : m.hideConfirm}
            </button>
            <button type="button" onClick={() => setOpen(null)} className={`${button} underline underline-offset-4`}>
              {labels.back}
            </button>
          </div>
          <p role="status" className={`text-body-sm ${errorText(visState, m) ? "font-medium text-danger" : "text-success"}`}>
            {errorText(visState, m) ?? (visState.ok ? m.done : "")}
          </p>
        </form>
      ) : null}
    </div>
  );
}
