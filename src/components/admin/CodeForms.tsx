"use client";

import { useActionState, useId, useState } from "react";
import { createCodeAction, stopCodeAction, type CodeState } from "@/app/beheer/kortingen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { interpolate } from "@/lib/text";

type Labels = AdminMessages["codes"];

function errorText(s: CodeState, m: Labels): string | null {
  if (s.ok !== false) return null;
  switch (s.error) {
    case "code":
      return m.errorCode;
    case "taken":
      return m.errorTaken;
    case "percent":
      return m.errorPercent;
    case "min":
      return m.errorMin;
    case "max-uses":
      return m.errorMaxUses;
    case "dates":
      return m.errorDates;
    case "not-found":
      return m.errorNotFound;
    case "ended":
      return m.errorEnded;
    case "access":
      return m.errorAccess;
  }
}

const local = (v: string) => v.replace("T", " ");

/**
 * A new discount code: the text, percentage, minimum, how often and the
 * period; then "Controleren", which spells it out, then the save
 * (.claude/rules/beveiliging.md § Destructieve en financiële handelingen).
 * The server checks it all again.
 */
export function NewCodeForm({ start, end, m, busy }: { start: string; end: string; m: Labels; busy: string }) {
  const id = useId();
  const [v, setV] = useState({ code: "", percent: "", minSubtotal: "", maxUses: "", startsAt: start, endsAt: end });
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [state, create, creating] = useActionState<CodeState, FormData>(async (prev, form) => {
    const next = await createCodeAction(prev, form);
    setStep("edit");
    if (next.ok) setV((cur) => ({ ...cur, code: "", percent: "", minSubtotal: "", maxUses: "" }));
    return next;
  }, { ok: null });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const field = "rounded-md border border-border bg-surface px-3 py-2 text-foreground";
  const button = "min-h-11 rounded-md px-4 font-medium";
  const message = errorText(state, m);
  const min = v.minSubtotal.trim() ? interpolate(m.withMin, { amount: v.minSubtotal.trim() }) : m.noMin;
  const max = v.maxUses.trim() ? interpolate(m.withMax, { count: v.maxUses.trim() }) : m.noMax;

  const input = (k: keyof typeof v, label: string, hint: string | null, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${k}`} className="font-medium">
        {label}
      </label>
      <input id={`${id}-${k}`} name={k} value={v[k]} onChange={set(k)} aria-describedby={hint ? `${id}-${k}-hint` : undefined} className={`${field} tabular-nums`} {...extra} />
      {hint ? (
        <p id={`${id}-${k}-hint`} className="text-body-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );

  return (
    <form action={create} className="flex flex-col gap-4">
      <fieldset disabled={step === "review"} className="grid gap-4 sm:grid-cols-2">
        {input("code", m.codeLabel, m.codeHint, { required: true, maxLength: 32, autoComplete: "off", spellCheck: false, className: `${field} uppercase tabular-nums` })}
        {input("percent", m.percentLabel, m.percentHint, { required: true, inputMode: "decimal", className: `${field} max-w-40 tabular-nums` })}
        {input("minSubtotal", m.minLabel, m.minHint, { inputMode: "decimal", className: `${field} max-w-40 tabular-nums` })}
        {input("maxUses", m.maxLabel, m.maxHint, { inputMode: "numeric", className: `${field} max-w-40 tabular-nums` })}
        {input("startsAt", m.startsLabel, null, { type: "datetime-local", required: true, "aria-describedby": `${id}-times` })}
        {input("endsAt", m.endsLabel, null, { type: "datetime-local", required: true, "aria-describedby": `${id}-times` })}
        <p id={`${id}-times`} className="text-body-sm text-muted sm:col-span-2">
          {m.timesHint}
        </p>
      </fieldset>
      {/* A disabled fieldset sends nothing: during the review the values travel as hidden fields. */}
      {step === "review" ? Object.entries(v).map(([k, value]) => <input key={k} type="hidden" name={k} value={value} />) : null}
      {step === "edit" ? (
        <div>
          <button type="button" onClick={() => setStep("review")} className={`${button} bg-petrol font-bold text-on-petrol`}>
            {m.review}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          <p className="font-medium">{m.reviewTitle}</p>
          <p>{interpolate(m.summary, { code: v.code.trim().toUpperCase(), percent: `${v.percent.trim()} %`, min, max, from: local(v.startsAt), to: local(v.endsAt) })}</p>
          <div className="flex flex-wrap gap-3">
            <button type="submit" aria-disabled={creating} onClick={(e) => creating && e.preventDefault()} className={`${button} bg-accent font-bold text-accent-contrast`}>
              {creating ? busy : m.create}
            </button>
            <button type="button" onClick={() => setStep("edit")} className={`${button} underline underline-offset-4`}>
              {m.back}
            </button>
          </div>
        </div>
      )}
      <p role="status" className={`text-body-sm ${message ? "font-medium text-danger" : "text-success"}`}>
        {message ?? (state.ok ? m.created : "")}
      </p>
    </form>
  );
}

/** Stop a running or upcoming code, after a confirmation; the row and its uses stay. */
export function StopCode({ codeId, m, busy }: { codeId: string; m: Labels; busy: string }) {
  const [open, setOpen] = useState(false);
  const [state, stop, stopping] = useActionState<CodeState, FormData>(stopCodeAction, { ok: null });
  const button = "min-h-11 rounded-md px-4 font-medium";
  const message = errorText(state, m);
  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <form action={stop} className="flex flex-col gap-2 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          <input type="hidden" name="codeId" value={codeId} />
          <p>{m.stopText}</p>
          <div className="flex flex-wrap gap-3">
            <button type="submit" aria-disabled={stopping} onClick={(e) => stopping && e.preventDefault()} className={`${button} bg-danger font-bold text-on-petrol`}>
              {stopping ? busy : m.stopConfirm}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={`${button} underline underline-offset-4`}>
              {m.back}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={`${button} bg-surface text-danger ring-1 ring-border`}>
            {m.stop}
          </button>
        </div>
      )}
      <p role="status" className={`text-body-sm ${message ? "font-medium text-danger" : "text-success"}`}>
        {message ?? (state.ok ? m.stopped : "")}
      </p>
    </div>
  );
}
