"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Messages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/text";

type Labels = Messages["reviews"];
type Entry = { rating: number; body: string };

async function post(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {} };
  } catch {
    return { status: 0, data: {} };
  }
}

/** 1–5 as radio buttons: a real choice with the keyboard, and the number read out (WCAG). */
function StarInput({ name, value, onChange, legend, m }: { name: string; value: number; onChange: (n: number) => void; legend: string; m: Labels }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md px-2 text-h2 ring-1 ring-border has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${n <= value ? "bg-accent text-accent-contrast" : "bg-surface text-muted"}`}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <span aria-hidden="true">★</span>
            <span className="sr-only">{interpolate(m.ratingLabel, { rating: n })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The review form (D-12): the shop and each product bought, every one
 * optional, at least one. Only with the key from the invitation; the server
 * checks it and everything else again.
 */
export function ReviewForm({ token, reference, products, shopReviewed, m }: { token: string; reference: string; products: { key: string; name: string; reviewed: boolean }[]; shopReviewed: boolean; m: Labels }) {
  const id = useId();
  const [shop, setShop] = useState<Entry>({ rating: 0, body: "" });
  const [items, setItems] = useState<Record<string, Entry>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const open = products.filter((p) => !p.reviewed);
  if (done) {
    return (
      <section className="rounded-md bg-success-soft p-6">
        <h2 ref={doneRef} tabIndex={-1} className="font-display text-h2">
          {m.thanksTitle}
        </h2>
        <p>{m.thanksText}</p>
      </section>
    );
  }
  if (shopReviewed && !open.length) return <p>{m.allDone}</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const chosen = Object.fromEntries(Object.entries(items).filter(([, v]) => v.rating > 0).map(([k, v]) => [k, { rating: v.rating, body: v.body }]));
    if (!shop.rating && !Object.keys(chosen).length) return setMessage(m.errorEmpty);
    if (busy) return;
    setBusy(true);
    const r = await post({ action: "submit", token, displayName: name, shop: shop.rating ? { rating: shop.rating, body: shop.body } : null, products: chosen });
    setBusy(false);
    if (r.status === 200) return setDone(true);
    const err = r.data.error;
    setMessage(r.status === 429 ? m.rateLimit : r.data.kind === "already" ? m.allDone : err === "name" ? m.errorName : err === "body" ? m.errorBody : r.data.kind === "not-yet" ? m.notYet : m.error);
  }

  const area = "rounded-md border border-border bg-surface px-3 py-2 text-foreground";
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <p className="tabular-nums text-muted">{interpolate(m.formIntro, { reference })}</p>
      {!shopReviewed ? (
        <section className="flex flex-col gap-3">
          <StarInput name={`${id}-shop`} value={shop.rating} onChange={(rating) => setShop((s) => ({ ...s, rating }))} legend={m.shopQuestion} m={m} />
          <label className="flex flex-col gap-1">
            <span className="font-medium">{m.bodyLabel}</span>
            <textarea value={shop.body} onChange={(e) => setShop((s) => ({ ...s, body: e.target.value }))} rows={3} maxLength={2000} className={area} />
          </label>
        </section>
      ) : null}
      {open.map((p) => {
        const v = items[p.key] ?? { rating: 0, body: "" };
        const set = (patch: Partial<Entry>) => setItems((x) => ({ ...x, [p.key]: { ...v, ...patch } }));
        return (
          <section key={p.key} className="flex flex-col gap-3 border-t border-line pt-6">
            <StarInput name={`${id}-${p.key}`} value={v.rating} onChange={(rating) => set({ rating })} legend={interpolate(m.productQuestion, { name: p.name })} m={m} />
            <label className="flex flex-col gap-1">
              <span className="font-medium">{m.bodyLabel}</span>
              <textarea value={v.body} onChange={(e) => set({ body: e.target.value })} rows={3} maxLength={2000} className={area} />
            </label>
          </section>
        );
      })}
      <label className="flex max-w-md flex-col gap-1 border-t border-line pt-6">
        <span className="font-medium">{m.nameLabel}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" aria-describedby={`${id}-name-hint`} className={`min-h-11 ${area}`} />
        <span id={`${id}-name-hint`} className="text-body-sm text-muted">
          {m.nameHint}
        </span>
      </label>
      <p className="text-body-sm text-muted">{m.publicNote}</p>
      <div>
        <button type="submit" aria-disabled={busy || undefined} className="min-h-11 rounded-md bg-accent px-5 font-bold text-accent-contrast">
          {busy ? m.busy : m.submit}
        </button>
      </div>
      <p role="status" className="text-warning">
        {message ?? ""}
      </p>
    </form>
  );
}

/** "No more invitations": a button, so a link preview in a mail program cannot opt anyone out (never a change by GET). */
export function OptOut({ token, m }: { token: string; m: Labels }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-6">
      <p className="text-body-sm text-muted">{m.optOutText}</p>
      {state === "done" ? (
        <p role="status" className="font-medium text-success">
          {m.optOutDone}
        </p>
      ) : (
        <div>
          <button
            type="button"
            aria-disabled={state === "busy" || undefined}
            onClick={async () => {
              if (state === "busy") return;
              setState("busy");
              const r = await post({ action: "optout", token });
              setState(r.status === 200 ? "done" : "error");
            }}
            className="min-h-11 rounded-md bg-surface px-4 font-medium ring-1 ring-border"
          >
            {m.optOut}
          </button>
          {state === "error" ? (
            <p role="status" className="text-body-sm text-warning">
              {m.error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
