// Who may open what in the admin panel (D-07, owner 2026-10-12): three fixed
// roles, one permission per screen. Pure and without imports: a client
// component may import this to hide a button, and must never pull a database
// driver into the browser bundle with it. Hiding a button is not the check —
// every page, action and route asks ./access.ts (.claude/rules/beveiliging.md).

export const PERMISSIONS = [
  /** Orders and customer details: name, address, e-mail. */
  "bestellingen",
  /** Money back to a customer: the only thing in the panel that moves money out. */
  "terugbetalen",
  "facturen",
  /** The selling price of the whole range in one form. */
  "prijzen",
  /** Promotions and codes: giving money away. */
  "kortingen",
  "beoordelingen",
  "retouren",
  /** Handing out permissions — and with that, every other permission. */
  "beheerders",
  "statistieken",
  /** The audit log: who did what to which object (docs/BEHEER.md § Beheerders). Only the owner's role has it (D-07). */
  "logboek",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["eigenaar", "boekhouder", "marketing"] as const;
export type Role = (typeof ROLES)[number];

/** These stay with the owner, however the rest is divided (D-07). */
export const OWNER_ONLY: readonly Permission[] = ["terugbetalen", "prijzen", "beheerders", "retouren"];

const MATRIX: Record<Role, readonly Permission[]> = {
  eigenaar: PERMISSIONS,
  boekhouder: ["facturen"],
  marketing: ["kortingen", "beoordelingen", "statistieken"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  if (OWNER_ONLY.includes(permission) && role !== "eigenaar") return false;
  return MATRIX[role].includes(permission);
}
