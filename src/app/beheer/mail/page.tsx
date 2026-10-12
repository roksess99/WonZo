import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { company } from "@/lib/company";
import { getMessages } from "@/lib/i18n/messages";
import { EXAMPLES } from "@/lib/mail/examples";
import { adminAlert, adminNewOrder, orderCancelled, orderConfirmation } from "@/lib/mail/messages";
import { money } from "@/lib/money";
import { siteUrl } from "@/lib/seo";

export async function generateMetadata() {
  await requirePage("bestellingen");
  return { title: adminMessages().mailPreview.title };
}

/**
 * Every mail with example orders, without sending anything (docs/MAIL.md §
 * Voorvertoning tijdens het bouwen). The HTML is shown in a sandboxed frame:
 * no script runs in it, and it cannot touch this page.
 */
export default async function MailPreviewPage({ searchParams }: PageProps<"/beheer/mail">) {
  await requirePage("bestellingen");
  const am = adminMessages();
  const m = am.mailPreview;
  const { voorbeeld } = await searchParams;
  const example = EXAMPLES.find((e) => e.id === voorbeeld) ?? EXAMPLES[0]!;
  const o = example.order;
  const abs = (p: string) => new URL(p, siteUrl).toString();
  const links = { statusUrl: abs("/bestelling/voorbeeld-sleutel"), contactUrl: abs(o.locale === "en" ? "/en/contact" : "/contact"), logoUrl: abs("/brand/png/wonzo-wordmark-1744px.png"), email: company.email };
  const admin = abs("/beheer/bestellingen/1");
  const mails = [
    { id: "bevestiging", label: m.confirmation, mail: orderConfirmation(o, links, getMessages(o.locale)) },
    { id: "annulering", label: m.cancelled, mail: orderCancelled({ locale: o.locale, reference: o.reference, refund: o.total.amount > 0 ? o.total : money(1) }, links, getMessages(o.locale)) },
    { id: "nieuw", label: m.newOrder, mail: adminNewOrder(o, admin, links.logoUrl, am) },
    { id: "let-op", label: m.alert, mail: adminAlert({ reference: o.reference, kind: "supplierFailed", detail: { error: "geweigerd (HTTP 400) Insufficient balance" }, paid: true }, admin, links.logoUrl, am) },
  ];

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
      <nav aria-label={m.examples}>
        <ul className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <li key={e.id}>
              <a
                href={`/beheer/mail?voorbeeld=${e.id}`}
                aria-current={e.id === example.id ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-4 font-medium ring-1 ring-line ${e.id === example.id ? "bg-petrol text-on-petrol" : "bg-surface"}`}
              >
                {e.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {mails.map((x) => (
        <section key={x.id} aria-labelledby={`mail-${x.id}`} className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id={`mail-${x.id}`} className="font-display text-h2">
            {x.label}
          </h2>
          <p>
            <span className="text-muted">{m.subject}:</span> <strong>{x.mail.subject}</strong>
          </p>
          <iframe title={`${x.label} — HTML`} srcDoc={x.mail.html} sandbox="" className="h-[36rem] w-full rounded-md bg-background ring-1 ring-line" />
          <details>
            <summary className="cursor-pointer font-medium">{m.textVersion}</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-background p-4 text-body-sm">{x.mail.text}</pre>
          </details>
        </section>
      ))}
    </>
  );
}
