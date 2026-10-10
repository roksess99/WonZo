// The customer's details for an order, checked at the edge
// (.claude/rules/beveiliging.md: everything from outside through a schema).
// What BigBuy needs to deliver: name, address, e-mail and phone
// (docs/api/LEVERANCIER.md § 10). One market: the Netherlands (D-14).
// Pure.

export type CustomerDetails = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  /** Normalised: "1234 AB". */
  postcode: string;
  city: string;
  country: "NL";
};

export const CUSTOMER_FIELDS = ["email", "phone", "firstName", "lastName", "street", "houseNumber", "postcode", "city", "country"] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];
/** Per field: missing, or not in the form we can deliver to. */
export type FieldError = "required" | "invalid" | "too-long";

// Lengths follow the columns in db/migrations/0002_orders.sql.
const MAX: Record<CustomerField, number> = {
  email: 254,
  phone: 32,
  firstName: 100,
  lastName: 100,
  street: 200,
  houseNumber: 20,
  postcode: 10,
  city: 100,
  country: 2,
};

// No control characters anywhere: they end up in mail, invoice and the supplier's label.
const CONTROL = /[\u0000-\u001f\u007f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits with an optional leading +; spaces, dashes and brackets are dropped first.
const PHONE = /^\+?\d{8,15}$/;
const POSTCODE = /^([1-9]\d{3}) ?([A-Za-z]{2})$/;
const HOUSE_NUMBER = /^\d{1,5}(\s?[A-Za-z0-9-]{1,10})?$/;

export function parseCustomer(input: unknown): { ok: true; customer: CustomerDetails } | { ok: false; errors: Partial<Record<CustomerField, FieldError>> } {
  const raw = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const errors: Partial<Record<CustomerField, FieldError>> = {};
  const text = (field: CustomerField): string => {
    const v = raw[field];
    const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
    if (!s) errors[field] = "required";
    else if (s.length > MAX[field]) errors[field] = "too-long";
    else if (CONTROL.test(s)) errors[field] = "invalid";
    return s;
  };

  const email = text("email");
  if (email && !errors.email && !EMAIL.test(email)) errors.email = "invalid";
  const phoneRaw = text("phone");
  const phone = phoneRaw.replace(/[\s\-().]/g, "");
  if (phoneRaw && !errors.phone && !PHONE.test(phone)) errors.phone = "invalid";
  const firstName = text("firstName");
  const lastName = text("lastName");
  const street = text("street");
  const houseNumber = text("houseNumber");
  if (houseNumber && !errors.houseNumber && !HOUSE_NUMBER.test(houseNumber)) errors.houseNumber = "invalid";
  const postcodeRaw = text("postcode");
  const pc = POSTCODE.exec(postcodeRaw);
  if (postcodeRaw && !errors.postcode && !pc) errors.postcode = "invalid";
  const city = text("city");
  // One market (D-14): an address outside the Netherlands is refused, not silently accepted.
  const countryRaw = typeof raw.country === "string" ? raw.country.trim().toUpperCase() : "NL";
  if (countryRaw !== "NL") errors.country = "invalid";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    customer: {
      email,
      phone,
      firstName,
      lastName,
      street,
      houseNumber,
      postcode: `${pc![1]} ${pc![2]!.toUpperCase()}`,
      city,
      country: "NL",
    },
  };
}
