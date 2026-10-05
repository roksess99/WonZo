"use client";

import { useState } from "react";
import { interpolate } from "@/lib/text";

export type StepperLabels = { quantity: string; decrease: string; increase: string; range: string };

type Props = {
  id: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  labels: StepperLabels;
  /** Visible label above the field instead of a screen-reader-only one. */
  showLabel?: boolean;
};

/**
 * − [n] + with 44px targets (docs/ONDERZOEK.md § 4). A typed value outside
 * 1–max is refused with a message at the field, never silently changed
 * (.claude/rules/geld.md § Buiten bereik).
 */
export function QuantityStepper({ id, value, max, onChange, labels, showLabel = false }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const upper = Math.max(1, max);

  function commit(text: string) {
    const n = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
    if (Number.isSafeInteger(n) && n >= 1 && n <= upper) {
      setError(false);
      setDraft(null);
      if (n !== value) onChange(n);
    } else {
      setError(true);
      setDraft(null);
    }
  }

  const step = (n: number) => {
    setError(false);
    setDraft(null);
    onChange(n);
  };

  const button = "inline-flex size-11 items-center justify-center text-h2 leading-none disabled:cursor-not-allowed disabled:text-muted";
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={showLabel ? "text-body-sm font-medium" : "sr-only"}>
        {labels.quantity}
      </label>
      <div className="inline-flex w-fit items-center rounded-md bg-surface ring-1 ring-border">
        <button type="button" className={`${button} rounded-s-md`} onClick={() => step(value - 1)} disabled={value <= 1} aria-label={labels.decrease} aria-controls={id}>
          <span aria-hidden="true">−</span>
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
            }
          }}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-11 w-12 border-x border-line bg-surface text-center tabular-nums"
        />
        <button type="button" className={`${button} rounded-e-md`} onClick={() => step(value + 1)} disabled={value >= upper} aria-label={labels.increase} aria-controls={id}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-body-sm text-danger">
          {interpolate(labels.range, { max: upper })}
        </p>
      ) : null}
    </div>
  );
}
