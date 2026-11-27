// `pnpm admin:herstel` (vitest.recover.config.ts): the owner lost password,
// app and recovery codes, and there is no other owner to reset them (D-07).
// Clears them for the active owner with ADMIN_RECOVER_EMAIL and prints a new
// invitation link: open it within 48 hours to set a new password, link the
// app again and get new recovery codes. The link works once and exists only
// in this terminal; the audit log says the recovery script did it.

import { afterAll, it } from "vitest";
import { recoverOwner } from "@/lib/admin/auth";
import { getPool } from "@/lib/db";
import { siteUrl } from "@/lib/seo";

afterAll(async () => {
  await getPool().end();
});

it("herstelt de toegang van de eigenaar", async () => {
  const result = await recoverOwner(process.env.ADMIN_RECOVER_EMAIL);
  if (!result.ok) {
    throw new Error(
      result.error === "email"
        ? "ADMIN_RECOVER_EMAIL is geen geldig mailadres."
        : "Geen actieve eigenaar met dat mailadres in deze database. Er is niets gewijzigd.",
    );
  }
  const link = new URL(`/beheer/uitnodiging/${result.token}`, siteUrl).toString();
  const until = result.expiresAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
  console.log(
    [
      "",
      "Toegang gewist: wachtwoord, app-koppeling, herstelcodes en sessies.",
      "Open deze link in je browser om een nieuw wachtwoord in te stellen en de app opnieuw te koppelen:",
      "",
      `  ${link}`,
      "",
      `Geldig tot ${until}, en maar één keer. Deel hem met niemand en bewaar hem nergens.`,
      "Haal daarna je IP-adres weer weg bij Remote MySQL en maak LIVE_DATABASE_* en ADMIN_RECOVER_EMAIL in .env weer leeg.",
      "",
    ].join("\n"),
  );
});
