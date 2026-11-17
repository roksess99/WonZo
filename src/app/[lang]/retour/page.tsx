import { notFound } from "next/navigation";
import { ReturnForm } from "@/components/returns/ReturnForm";
import { Container } from "@/components/ui";
import { company } from "@/lib/company";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { pageMetadata } from "@/lib/seo";
import { interpolate } from "@/lib/text";

export async function generateMetadata({ params }: PageProps<"/[lang]/retour">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang).returns;
  return pageMetadata(lang, { nl: "/retour", en: "/en/return" }, m.metaTitle, m.metaDescription);
}

/**
 * Sending something back (docs/RETOUREN.md § Wat de klant ziet): how it
 * works, the return address for whoever lost the label, and the form. The
 * explanation is in the first HTML; only the form needs JavaScript.
 */
export default async function ReturnPage({ params }: PageProps<"/[lang]/retour">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang).returns;
  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{m.title}</h1>
        <p>{m.intro}</p>
      </div>
      <section aria-labelledby="how" className="flex flex-col gap-2">
        <h2 id="how" className="font-display text-h2">
          {m.howTitle}
        </h2>
        <ul className="flex list-disc flex-col gap-1 ps-6">
          <li>{m.how1}</li>
          <li>{m.how2}</li>
          <li>{m.how3}</li>
          <li>{m.how4}</li>
        </ul>
      </section>
      <section className="rounded-md bg-surface p-6 ring-1 ring-line">
        <ReturnForm locale={lang} labels={m} contactEmail={company.email} />
      </section>
      <section aria-labelledby="address" className="flex flex-col gap-2">
        <h2 id="address" className="font-display text-h2">
          {m.addressTitle}
        </h2>
        <address className="not-italic">
          {company.tradeName} ({company.legalName})
          <br />
          {company.address}
        </address>
        <p className="text-body-sm text-muted">{interpolate(m.addressText, { email: company.email })}</p>
      </section>
    </Container>
  );
}
