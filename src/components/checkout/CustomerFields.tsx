"use client";

import { parseCustomer, type CustomerField, type FieldError } from "@/lib/orders/customer";

export type CustomerFieldLabels = Record<Exclude<CustomerField, "country">, string> & {
  emailHint: string;
  phoneHint: string;
  countryNote: string;
  required: string;
  tooLong: string;
  invalid: string;
  emailInvalid: string;
  phoneInvalid: string;
  postcodeInvalid: string;
  houseNumberInvalid: string;
  countryInvalid: string;
};

export type CustomerValues = Record<Exclude<CustomerField, "country">, string>;
export const EMPTY_CUSTOMER: CustomerValues = { email: "", phone: "", firstName: "", lastName: "", postcode: "", houseNumber: "", street: "", city: "" };

/** The order of the form: contact first, then the address in the Dutch way (postcode and number first). */
export const FIELD_ORDER = ["email", "phone", "firstName", "lastName", "postcode", "houseNumber", "street", "city"] as const;

// WCAG 1.3.5: the purpose of each field, so the browser can fill it in.
const AUTOCOMPLETE: Record<(typeof FIELD_ORDER)[number], string> = {
  email: "email",
  phone: "tel",
  firstName: "given-name",
  lastName: "family-name",
  postcode: "postal-code",
  houseNumber: "off",
  street: "address-line1",
  city: "address-level2",
};

export function errorText(field: CustomerField, error: FieldError, labels: CustomerFieldLabels): string {
  if (error === "required") return labels.required;
  if (error === "too-long") return labels.tooLong;
  const specific: Partial<Record<CustomerField, string>> = {
    email: labels.emailInvalid,
    phone: labels.phoneInvalid,
    postcode: labels.postcodeInvalid,
    houseNumber: labels.houseNumberInvalid,
    country: labels.countryInvalid,
  };
  return specific[field] ?? labels.invalid;
}

/** The same check as the server (src/lib/orders/customer.ts): what passes here passes there. */
export function validate(values: CustomerValues): Partial<Record<CustomerField, FieldError>> {
  const r = parseCustomer({ ...values, country: "NL" });
  return r.ok ? {} : r.errors;
}

type Props = {
  idPrefix: string;
  values: CustomerValues;
  /** Only the fields to show an error for (touched, or after a submit). */
  errors: Partial<Record<CustomerField, FieldError>>;
  labels: CustomerFieldLabels;
  onChange: (field: keyof CustomerValues, value: string) => void;
  onBlur: (field: keyof CustomerValues) => void;
};

/**
 * Name, contact and address, with the error at the field, in text and linked
 * for screen readers (docs/ACCESSIBILITY.md § Formulieren): label short, the
 * explanation as a description.
 */
export function CustomerFields({ idPrefix, values, errors, labels, onChange, onBlur }: Props) {
  const hints: Partial<Record<keyof CustomerValues, string>> = { email: labels.emailHint, phone: labels.phoneHint };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FIELD_ORDER.map((field) => {
        const id = `${idPrefix}-${field}`;
        const error = errors[field];
        const hint = hints[field];
        const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
        return (
          <div key={field} className={`flex flex-col gap-1 ${field === "email" || field === "street" ? "sm:col-span-2" : ""}`}>
            <label htmlFor={id} className="font-medium">
              {labels[field]}
            </label>
            {hint ? (
              <p id={`${id}-hint`} className="text-body-sm text-muted">
                {hint}
              </p>
            ) : null}
            <input
              id={id}
              name={field}
              type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
              inputMode={field === "phone" ? "tel" : field === "email" ? "email" : undefined}
              autoComplete={AUTOCOMPLETE[field]}
              autoCapitalize={field === "postcode" ? "characters" : undefined}
              spellCheck={field === "email" ? false : undefined}
              value={values[field]}
              onChange={(e) => onChange(field, e.target.value)}
              onBlur={() => onBlur(field)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={`min-h-11 rounded-md border bg-surface px-3 text-foreground ${error ? "border-danger" : "border-border"}`}
            />
            {error ? (
              <p id={`${id}-error`} className="text-body-sm text-danger">
                {errorText(field, error, labels)}
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="text-body-sm text-muted sm:col-span-2">{labels.countryNote}</p>
    </div>
  );
}
