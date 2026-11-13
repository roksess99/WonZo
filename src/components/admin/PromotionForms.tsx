"use client";

import { useActionState, useId, useState } from "react";
import { createPromotionAction, stopPromotionAction, type PromotionState } from "@/app/beheer/kortingen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { interpolate } from "@/lib/text";

type Labels = AdminMessages["promotions"];
type Option = { key: string; label: string };

function errorText(s: PromotionState, m: Labels): string | null {
  if (s.ok !== false) return null;
  switch (s.error) {
    case "name":
      return m.errorName;
    case "target":
      return m.errorTarget;
    case "product":
      return m.errorProduct;
    case "percent":
      return m.errorPercent;
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
 * A new promotion: name, target, percentage and period, then "Controleren",
 * which spells it out, then the save (.claude/rules/beveiliging.md §
 * Destructieve en financiële handelingen). The server checks it all again.
 */
export function NewPromotionForm({ categories, subcategories, start, end, m, busy }: { categories: Option[]; subcategories: Option[]; start: string; end: string; m: Labels; busy: string }) {
  const id = useId();
  const [v, setV] = useState({ name: "", kind: "category", category: categories[0]?.key ?? "", subcategory: subcategories[0]?.key ?? "", product: "", percent: "", startsAt: start, endsAt: end });
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [state, create, creating] = useActionState<PromotionState, FormData>(async (prev, form) => {
    const next = await createPromotionAction(prev, form);
    setStep("edit");
    if (next.ok) setV((cur) => ({ ...cur, name: "", product: "", percent: "" }));
    return next;
  }, { ok: null });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const target =
    v.kind === "category"
      ? `${m.kind.category.toLowerCase()} ${categories.find((c) => c.key === v.category)?.label ?? ""}`
      : v.kind === "subcategory"
        ? `${m.kind.subcategory.toLowerCase()} ${subcategories.find((c) => c.key === v.subcategory)?.label ?? ""}`
        : `${m.kind.product.toLowerCase()} ${v.product.trim()}`;
  const field = "rounded-md border border-border bg-surface px-3 py-2 text-foreground";
  const button = "min-h-11 rounded-md px-4 font-medium";
  const message = errorText(state, m);

  return (
    <form action={create} className="flex flex-col gap-4">
      <fieldset disabled={step === "review"} className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor={`${id}-name`} className="font-medium">
            {m.nameLabel}
          </label>
          <input id={`${id}-name`} name="name" value={v.name} onChange={set("name")} required minLength={2} maxLength={80} aria-describedby={`${id}-name-hint`} className={`${field} max-w-md`} />
          <p id={`${id}-name-hint`} className="text-body-sm text-muted">
            {m.nameHint}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-kind`} className="font-medium">
            {m.targetLabel}
          </label>
          <select id={`${id}-kind`} name="kind" value={v.kind} onChange={set("kind")} className={field}>
            <option value="category">{m.kind.category}</option>
            <option value="subcategory">{m.kind.subcategory}</option>
            <option value="product">{m.kind.product}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          {v.kind === "product" ? (
            <>
              <label htmlFor={`${id}-product`} className="font-medium">
                {m.productLabel}
              </label>
              <input id={`${id}-product`} name="product" value={v.product} onChange={set("product")} required aria-describedby={`${id}-product-hint`} className={`${field} tabular-nums`} />
              <p id={`${id}-product-hint`} className="text-body-sm text-muted">
                {m.productHint}
              </p>
            </>
          ) : (
            <>
              <label htmlFor={`${id}-group`} className="font-medium">
                {m.groupLabel}
              </label>
              <select id={`${id}-group`} name={v.kind} value={v.kind === "category" ? v.category : v.subcategory} onChange={set(v.kind === "category" ? "category" : "subcategory")} className={field}>
                {(v.kind === "category" ? categories : subcategories).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-percent`} className="font-medium">
            {m.percentLabel}
          </label>
          <input id={`${id}-percent`} name="percent" inputMode="decimal" value={v.percent} onChange={set("percent")} required aria-describedby={`${id}-percent-hint`} className={`${field} max-w-40 tabular-nums`} />
          <p id={`${id}-percent-hint`} className="text-body-sm text-muted">
            {m.percentHint}
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:col-start-1">
          <label htmlFor={`${id}-start`} className="font-medium">
            {m.startsLabel}
          </label>
          <input id={`${id}-start`} type="datetime-local" name="startsAt" value={v.startsAt} onChange={set("startsAt")} required aria-describedby={`${id}-times`} className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-end`} className="font-medium">
            {m.endsLabel}
          </label>
          <input id={`${id}-end`} type="datetime-local" name="endsAt" value={v.endsAt} onChange={set("endsAt")} required aria-describedby={`${id}-times`} className={field} />
        </div>
        <p id={`${id}-times`} className="text-body-sm text-muted sm:col-span-2">
          {m.timesHint}
        </p>
      </fieldset>
      {/* A disabled fieldset sends nothing: during the review the values travel as hidden fields. */}
      {step === "review"
        ? Object.entries(v).map(([k, value]) => <input key={k} type="hidden" name={k} value={value} />)
        : null}
      {step === "edit" ? (
        <div>
          <button type="button" onClick={() => setStep("review")} className={`${button} bg-petrol font-bold text-on-petrol`}>
            {m.review}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          <p className="font-medium">{m.reviewTitle}</p>
          <p>{interpolate(m.summary, { percent: `${v.percent.trim()} %`, target: target.trim(), from: local(v.startsAt), to: local(v.endsAt) })}</p>
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

/** Stop a running or upcoming promotion, after a confirmation; the row stays. */
export function StopPromotion({ promotionId, m, busy }: { promotionId: string; m: Labels; busy: string }) {
  const [open, setOpen] = useState(false);
  const [state, stop, stopping] = useActionState<PromotionState, FormData>(stopPromotionAction, { ok: null });
  const button = "min-h-11 rounded-md px-4 font-medium";
  const message = errorText(state, m);
  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <form action={stop} className="flex flex-col gap-2 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          <input type="hidden" name="promotionId" value={promotionId} />
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
