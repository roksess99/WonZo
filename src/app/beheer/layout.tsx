import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import Link from "next/link";
import { currentAdmin } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { can } from "@/lib/admin/permissions";
import { interpolate } from "@/lib/text";
import "../globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

const m = adminMessages();

// Never in an index, never from a cache, never in a referrer (D-07).
// The default title is the plain "not found" one: a stranger learns nothing from the tab.
export const metadata: Metadata = {
  title: { default: m.notFound.title, template: m.meta.titleTemplate },
  robots: { index: false, follow: false, nocache: true },
  referrer: "same-origin",
};

/**
 * The admin panel's own root layout: outside the shop's language routes,
 * Dutch only, light only (D-07, D-33). It shows the chrome only to an admin
 * — to anyone else /beheer is a plain "not found" — but it protects nothing:
 * every page and action checks for itself (src/lib/admin/access.ts).
 */
export default async function AdminLayout({ children }: LayoutProps<"/beheer">) {
  const admin = await currentAdmin();
  return (
    <html lang="nl" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col bg-background text-body text-foreground antialiased">
        {admin ? (
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
              <Link href="/beheer" className="font-display text-h2 font-bold">
                {m.nav.brand}
              </Link>
              <nav aria-label={m.nav.label} className="flex flex-wrap gap-4">
                <Link href="/beheer" className="underline-offset-4 hover:underline">
                  {m.nav.dashboard}
                </Link>
                {can(admin.role, "bestellingen") ? (
                  <Link href="/beheer/bestellingen" className="underline-offset-4 hover:underline">
                    {m.nav.orders}
                  </Link>
                ) : null}
                {can(admin.role, "retouren") ? (
                  <Link href="/beheer/retouren" className="underline-offset-4 hover:underline">
                    {m.nav.returns}
                  </Link>
                ) : null}
                {can(admin.role, "facturen") ? (
                  <Link href="/beheer/facturen" className="underline-offset-4 hover:underline">
                    {m.nav.invoices}
                  </Link>
                ) : null}
                {can(admin.role, "bestellingen") ? (
                  <Link href="/beheer/mail" className="underline-offset-4 hover:underline">
                    {m.nav.mail}
                  </Link>
                ) : null}
                {can(admin.role, "logboek") ? (
                  <Link href="/beheer/logboek" className="underline-offset-4 hover:underline">
                    {m.nav.log}
                  </Link>
                ) : null}
              </nav>
              <p className="ms-auto text-body-sm text-muted">{interpolate(m.nav.signedInAs, { name: admin.name })}</p>
            </div>
            {admin.id === "dev" ? <p className="bg-warning-soft px-4 py-1 text-center text-body-sm text-warning">{m.nav.localOnly}</p> : null}
          </header>
        ) : null}
        <main id="inhoud" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
