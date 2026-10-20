// The inputs of the login and account forms: label above, hint and error
// below and linked with aria-describedby (docs/ACCESSIBILITY.md), 44 px high.

import type { InputHTMLAttributes } from "react";

export const inputClass = "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-foreground";
export const primaryButton = "min-h-11 rounded-md bg-accent px-5 font-bold text-accent-contrast";
export const plainButton = "min-h-11 rounded-md bg-surface px-4 font-medium ring-1 ring-border";
export const dangerButton = "min-h-11 rounded-md bg-danger px-4 font-bold text-on-petrol";

export function Field({ id, label, hint, error, ...input }: { id: string; label: string; hint?: string; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input id={id} aria-describedby={described} aria-invalid={error ? true : undefined} className={inputClass} {...input} />
      {hint ? (
        <p id={`${id}-hint`} className="text-body-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-body-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
