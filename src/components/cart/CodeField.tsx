"use client";

import { useId, useState } from "react";
import type { CartQuote } from "@/lib/cart/quote";
import { formatMoney } from "@/lib/money";
import type { CodeRefusal } from "@/lib/pricing/codes";
import { interpolate } from "@/lib/text";
import { codeActions } from "./store";

export type CodeLabels = {
  discount: string;
  codeLabel: string;
  codeApply: string;
  codeRemove: string;
  codeApplied: string;
  codeLimited: string;
  codeSkipped: string;
  codeChecking: string;
  codeRefused: Record<CodeRefusal, string>;
};

const pct = (bp: number) => `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(bp / 100)}%`;

/** What the quote says about the code, in words: applied (and how), or why not. */
export function codeMessage(quote: CartQuote | null, labels: CodeLabels): { tone: "ok" | "error"; text: string } | null {
  const c = quote?.code;
  if (!c) return null;
  if (c.kind === "refused") return { tone: "error", text: interpolate(labels.codeRefused[c.reason], { code: c.code, amount: c.minSubtotal ? formatMoney(c.minSubtotal) : "" }) };
  const parts = [interpolate(labels.codeApplied, { code: c.code, percent: pct(c.percentBp) })];
  if (c.skippedPromoted) parts.push(labels.codeSkipped);
  if (c.limited) parts.push(labels.codeLimited);
  return { tone: "ok", text: parts.join(" ") };
}

/**
 * The discount code in the cart (docs/SCHERMEN.md § Winkelwagen: "where
 * someone with a code in hand goes looking"). The browser keeps only the
 * text; the quote says what it is worth. The result is announced in a
 * status region, and an error is tied to the field (docs/ACCESSIBILITY.md).
 */
export function CodeField({ code, quote, busy, labels }: { code: string; quote: CartQuote | null; busy: boolean; labels: CodeLabels }) {
  const id = useId();
  const [text, setText] = useState("");
  const message = code && !busy ? codeMessage(quote, labels) : null;
  const button = "min-h-11 rounded-md px-4 font-medium";

  if (code) {
    return (
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium tabular-nums">
            {labels.codeLabel}: {code}
          </p>
          <button type="button" onClick={() => codeActions.clear()} className={`${button} underline underline-offset-4`}>
            {labels.codeRemove}
          </button>
        </div>
        <p role="status" className={`text-body-sm ${message?.tone === "error" ? "font-medium text-danger" : "text-muted"}`}>
          {busy ? labels.codeChecking : (message?.text ?? "")}
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-1 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) codeActions.set(text);
        setText("");
      }}
    >
      <label htmlFor={`${id}-code`} className="font-medium">
        {labels.codeLabel}
      </label>
      <div className="flex gap-2">
        <input
          id={`${id}-code`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-foreground uppercase"
        />
        <button type="submit" className={`${button} bg-petrol text-on-petrol`}>
          {labels.codeApply}
        </button>
      </div>
    </form>
  );
}
