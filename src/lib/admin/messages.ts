// The admin panel's texts: Dutch only (D-07, owner 2026-10-12). Their own
// file, not in messages/nl.json: the shop's languages must have the same
// keys, and the panel has no English version to keep in step.

import nl from "../../../messages/beheer/nl.json";

export type AdminMessages = typeof nl;

export function adminMessages(): AdminMessages {
  return nl;
}
