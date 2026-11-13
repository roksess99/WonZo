"use client";

import { useActionState, useId, useState } from "react";
import { savePriceRulesAction, type PriceRulesState } from "@/app/beheer/prijzen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { parseEuro, parsePercent } from "@/lib/pricing/input";
import { formatMoney } from "@/lib/money";
import { MAX_MARKUP_BP, maxDiscountBp, priceProduct, type PriceInput } from "@/lib/pricing/rules";
import { interpolate } from "@/lib/text";

type Labels = AdminMessages["prices"];
/** `example`: one real product of the group, to show what a change does to it (docs/BEHEER.md § Prijzen). Owner only. */
export type PriceGroup = { key: string; label: string; markup: string; products: number; example: { name: string; input: PriceInput } | null };

const pct = (bp: number) => `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(bp / 100)} %`;
const okMarkup = (text: string) => {
  const bp = parsePercent(text);
  return bp !== undefined && (bp === null || bp <= MAX_MARKUP_BP);
};

function errorText(s: PriceRulesState, m: Labels, groups: PriceGroup[]): string | null {
  if (s.ok !== false) return null;
  switch (s.error) {
    case "markup":
      return m.errorMarkup;
    case "subcategory-markup":
      return interpolate(m.errorSubMarkup, { group: groups.find((g) => g.key === ("key" in s ? s.key : ""))?.label ?? "" });
    case "payment-cost":
      return m.errorPaymentCost;
    case "changed":
      return m.errorChanged;
    case "access":
      return m.errorAccess;
  }
}

/**
 * The price rule in one form (docs/BEHEER.md: "de verkoopprijs van het hele
 * assortiment in één formulier"). First "Controleren", which lists every
 * change as old → new; only then the save (.claude/rules/beveiliging.md §
 * Destructieve en financiële handelingen). The server checks it all again.
 */
export function PriceRulesForm({ version, defaultMarkup, paymentCost, groups, m, busy }: { version: number; defaultMarkup: string; paymentCost: string; groups: PriceGroup[]; m: Labels; busy: string }) {
  const id = useId();
  const [def, setDef] = useState(defaultMarkup);
  const [pay, setPay] = useState(paymentCost);
  const [per, setPer] = useState<Record<string, string>>(Object.fromEntries(groups.map((g) => [g.key, g.markup])));
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [local, setLocal] = useState<string | null>(null);
  const [state, save, saving] = useActionState<PriceRulesState, FormData>(async (prev, form) => {
    const next = await savePriceRulesAction(prev, form);
    if (next.ok) setStep("edit");
    return next;
  }, { ok: null });

  const show = (text: string) => (text.trim() === "" ? m.empty : `${text.trim()} %`);
  const changes: string[] = [];
  if (def.trim() !== defaultMarkup) changes.push(interpolate(m.change, { label: m.defaultLabel, from: defaultMarkup === "" ? m.advised : `${defaultMarkup} %`, to: def.trim() === "" ? m.advised : `${def.trim()} %` }));
  if (pay.trim() !== paymentCost) changes.push(interpolate(m.change, { label: m.paymentLabel, from: `€ ${paymentCost}`, to: `€ ${pay.trim()}` }));
  for (const g of groups) if ((per[g.key] ?? "").trim() !== g.markup) changes.push(interpolate(m.change, { label: g.label, from: show(g.markup), to: show(per[g.key] ?? "") }));

  // A real product per group whose price moves: "this one goes from € 8,40 to € 9,66" (docs/BEHEER.md § Prijzen). No promotions here: the list price.
  const rulesOf = (d: string, p: string, markups: Record<string, string>) => ({
    defaultMarkupBp: parsePercent(d) ?? null,
    paymentCostCents: parseEuro(p) ?? 0,
    markups: new Map(Object.entries(markups).flatMap(([k, v]) => { const bp = parsePercent(v); return typeof bp === "number" ? [[k, bp] as [string, number]] : []; })),
  });
  const examples: string[] = [];
  if (step === "review") {
    const before = rulesOf(defaultMarkup, paymentCost, Object.fromEntries(groups.map((g) => [g.key, g.markup])));
    const after = rulesOf(def, pay, per);
    const epoch = new Date(0);
    for (const g of groups) {
      if (!g.example) continue;
      const from = priceProduct(g.example.input, before, [], epoch).listPrice;
      const to = priceProduct(g.example.input, after, [], epoch).listPrice;
      if (from.amount !== to.amount) examples.push(interpolate(m.example, { name: g.example.name, from: formatMoney(from), to: formatMoney(to) }));
    }
  }

  function review() {
    if (!okMarkup(def)) return setLocal(m.errorMarkup);
    const cents = parseEuro(pay);
    if (cents === undefined || cents > 10_000) return setLocal(m.errorPaymentCost);
    const bad = groups.find((g) => !okMarkup(per[g.key] ?? ""));
    if (bad) return setLocal(interpolate(m.errorSubMarkup, { group: bad.label }));
    setLocal(null);
    setStep("review");
  }

  const room = (text: string) => {
    const own = parsePercent(text);
    const bp = own === null ? parsePercent(def) : own;
    if (bp === undefined) return "";
    return bp === null ? m.roomAdvised : interpolate(m.room, { percent: pct(maxDiscountBp(bp)) });
  };
  const button = "min-h-11 rounded-md px-4 font-medium";
  const input = "rounded-md border border-border bg-surface px-3 py-2 text-foreground tabular-nums";
  const message = local ?? errorText(state, m, groups);

  return (
    <div className="flex flex-col gap-6">
      <fieldset disabled={step === "review"} className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-def`} className="font-medium">
              {m.defaultLabel}
            </label>
            <input id={`${id}-def`} inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} aria-describedby={`${id}-def-hint`} className={`${input} max-w-40`} />
            <p id={`${id}-def-hint`} className="text-body-sm text-muted">
              {m.defaultHint}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-pay`} className="font-medium">
              {m.paymentLabel}
            </label>
            <input id={`${id}-pay`} inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} aria-describedby={`${id}-pay-hint`} className={`${input} max-w-40`} />
            <p id={`${id}-pay-hint`} className="text-body-sm text-muted">
              {m.paymentHint}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h2 font-bold">{m.groupsTitle}</h2>
          <p id={`${id}-groups-hint`} className="max-w-prose text-body-sm text-muted">
            {m.groupsHint}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-start">
              <thead>
                <tr className="border-b border-line text-body-sm text-muted">
                  <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colGroup}</th>
                  <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colMarkup}</th>
                  <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colRoom}</th>
                  <th scope="col" className="py-2 text-end font-medium">{m.colProducts}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-2 pe-4 text-start font-normal">
                      <label htmlFor={`${id}-${g.key}`}>{g.label}</label>
                    </th>
                    <td className="py-2 pe-4">
                      <input id={`${id}-${g.key}`} inputMode="decimal" value={per[g.key] ?? ""} placeholder={def.trim()} onChange={(e) => setPer({ ...per, [g.key]: e.target.value })} aria-describedby={`${id}-groups-hint`} className={`${input} w-28`} />
                    </td>
                    <td className="py-2 pe-4 text-body-sm tabular-nums">{room(per[g.key] ?? "")}</td>
                    <td className="py-2 text-end tabular-nums">{g.products}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </fieldset>

      {step === "edit" ? (
        <div>
          <button type="button" onClick={review} className={`${button} bg-petrol font-bold text-on-petrol`}>
            {m.review}
          </button>
        </div>
      ) : (
        <form action={save} className="flex flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="defaultMarkup" value={def} />
          <input type="hidden" name="paymentCost" value={pay} />
          {groups.map((g) => (
            <input key={g.key} type="hidden" name={`markup:${g.key}`} value={per[g.key] ?? ""} />
          ))}
          <p className="font-medium">{m.reviewTitle}</p>
          {changes.length ? (
            <>
              <p>{m.reviewText}</p>
              <ul className="list-disc ps-6">
                {changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {examples.length ? (
                <>
                  <p>{m.examplesTitle}</p>
                  <ul className="list-disc ps-6 tabular-nums">
                    {examples.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p>{m.noChanges}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {changes.length ? (
              <button type="submit" aria-disabled={saving} onClick={(e) => saving && e.preventDefault()} className={`${button} bg-accent font-bold text-accent-contrast`}>
                {saving ? busy : m.save}
              </button>
            ) : null}
            <button type="button" onClick={() => setStep("edit")} className={`${button} underline underline-offset-4`}>
              {m.back}
            </button>
          </div>
        </form>
      )}
      <p role="status" className={`text-body-sm ${message ? "font-medium text-danger" : "text-success"}`}>
        {message ?? (state.ok ? (state.changed ? m.done : m.unchanged) : "")}
      </p>
    </div>
  );
}
