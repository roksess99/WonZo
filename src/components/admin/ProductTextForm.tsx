"use client";

import { useActionState, useState } from "react";
import { saveProductTextsAction, type ProductTextsState } from "@/app/beheer/productteksten/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { interpolate } from "@/lib/text";

type Labels = AdminMessages["texts"];

function errorText(s: ProductTextsState, m: Labels, max: number): string | null {
  if (s.ok !== false) return null;
  switch (s.error) {
    case "too-long":
      return interpolate(m.errorTooLong, { max });
    case "changed":
      return m.errorChanged;
    case "product":
      return m.errorProduct;
    case "access":
      return m.errorAccess;
  }
}

/**
 * Both languages in one form, saved together on the version the page showed
 * (src/lib/catalog/texts.ts). The counter is a help; the server checks the
 * length again. After a "changed" refusal the typed text stays in the fields.
 */
export function ProductTextForm({
  productId,
  version,
  nl,
  en,
  names,
  max,
  m,
  busy,
}: {
  productId: string;
  version: number;
  nl: string;
  en: string;
  names: { nl: string; en: string };
  max: number;
  m: Labels;
  busy: string;
}) {
  const [texts, setTexts] = useState({ nl, en });
  const [state, save, saving] = useActionState<ProductTextsState, FormData>(saveProductTextsAction, { ok: null });
  const current = state.ok === true ? state.version : version;
  const error = errorText(state, m, max);

  return (
    // While saving, a second click does nothing: it would arrive on the old version and read as "changed elsewhere".
    <form action={save} onSubmit={(e) => saving && e.preventDefault()} className="flex flex-col gap-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="version" value={current} />
      {(["nl", "en"] as const).map((lang) => {
        const id = `intro-${lang}`;
        const length = [...texts[lang]].length;
        return (
          <div key={lang} className="flex flex-col gap-1">
            <label htmlFor={id} className="font-medium">
              {lang === "nl" ? m.nlLabel : m.enLabel}
            </label>
            <span className="text-body-sm text-muted" lang={lang}>
              {names[lang]}
            </span>
            <textarea
              id={id}
              name={lang}
              lang={lang}
              rows={5}
              value={texts[lang]}
              onChange={(e) => setTexts((t) => ({ ...t, [lang]: e.target.value }))}
              aria-describedby={`${id}-hint ${id}-count`}
              aria-invalid={length > max || undefined}
              className="w-full max-w-prose rounded-sm border border-border bg-background px-3 py-2 text-foreground"
            />
            <span id={`${id}-hint`} className="text-body-sm text-muted">
              {interpolate(m.fieldHint, { max })}
            </span>
            <span id={`${id}-count`} className={`text-body-sm tabular-nums ${length > max ? "font-medium text-danger" : "text-muted"}`}>
              {interpolate(m.counter, { count: length, max })}
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" aria-disabled={saving || undefined} className="min-h-11 rounded-md bg-petrol px-4 font-medium text-on-petrol">
          {saving ? busy : m.save}
        </button>
      </div>
      <p role="status" aria-live="polite" className={error ? "font-medium text-danger" : "text-in-stock"}>
        {error ?? (state.ok === true ? (state.changed ? m.done : m.unchanged) : "")}
      </p>
    </form>
  );
}
