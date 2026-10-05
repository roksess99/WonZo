import { notFound } from "next/navigation";
import { Container } from "@/components/ui";
import { company } from "@/lib/company";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  return pageMetadata(lang, { nl: "/contact", en: "/en/contact" }, m.contact.title, m.contact.intro);
}

/** Contact with company details: the first place doubt goes (docs/SCHERMEN.md § Statische pagina's). */
export default async function Contact({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const c = getMessages(lang).contact;
  const missing = <span className="text-warning">{c.missing}</span>;
  const rows: [string, React.ReactNode][] = [
    [c.tradeName, company.tradeName],
    [c.companyName, company.legalName],
    [c.address, company.address ?? missing],
    [c.kvk, company.kvk],
    [c.vat, company.vat ?? missing],
  ];
  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{c.title}</h1>
        <p>{c.intro}</p>
        <p>
          <span className="font-medium">{c.emailLabel}: </span>
          <a href={`mailto:${company.email}`} className="underline underline-offset-4">
            {company.email}
          </a>
        </p>
      </div>
      <section aria-labelledby="company" className="flex flex-col gap-3">
        <h2 id="company" className="font-display text-h2">
          {c.companyTitle}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-medium">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Container>
  );
}
