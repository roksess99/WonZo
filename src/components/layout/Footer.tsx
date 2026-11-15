import Link from "next/link";
import { company } from "@/lib/company";
import type { Locale } from "@/lib/i18n/config";
import { t, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { Container } from "../ui";

/** The name in the credit line: the same in every language. */
const CREDIT_NAME = "Nixlo";

/** Company details visible on every page (docs/SCHERMEN.md § Vertrouwen; ACM). */
export function Footer({ locale, m }: { locale: Locale; m: Messages }) {
  const missing = <em className="not-italic underline decoration-dotted">{m.contact.missing}</em>;
  const [creditBefore = "", creditAfter = ""] = m.credit.text.split("{name}");
  return (
    <footer className="on-petrol mt-16 bg-petrol text-on-petrol">
      <Container className="grid gap-8 py-10 sm:grid-cols-2">
        <section aria-labelledby="footer-service">
          <h2 id="footer-service" className="mb-3 text-label uppercase">
            {m.footer.service}
          </h2>
          <ul className="flex flex-col">
            <li>
              <Link href={localizePath(locale, "/zo-werkt-wonzo")} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                {m.footer.howItWorks}
              </Link>
            </li>
            <li>
              <Link href={localizePath(locale, "/contact")} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                {m.footer.contact}
              </Link>
            </li>
          </ul>
        </section>
        <section aria-labelledby="footer-company">
          <h2 id="footer-company" className="mb-3 text-label uppercase">
            {m.footer.company}
          </h2>
          <address className="flex flex-col gap-1 not-italic">
            <span>
              {company.tradeName} · {company.legalName}
            </span>
            <span>{company.address ?? missing}</span>
            <span>{t(m.footer.kvk, { kvk: company.kvk })}</span>
            <span>{company.vat ? t(m.footer.vat, { vat: company.vat }) : <>{t(m.footer.vat, { vat: "" })}{missing}</>}</span>
            <a href={`mailto:${company.email}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
              {company.email}
            </a>
          </address>
        </section>
      </Container>
      {/* Credit to the web designer (Nixlo): one quiet line under the columns. Only "Nixlo" is the link,
          in a new tab so the visitor keeps the shop open. Underlined in the sentence, not by colour alone
          (WCAG 1.4.1); the focus ring is the light one of the petrol footer (.on-petrol). */}
      <Container className="border-t border-on-petrol/20 py-3 text-body-sm">
        <p className="flex min-h-11 items-center">
          <span>
            {creditBefore}
            <a href={m.credit.url} target="_blank" rel="noopener" className="underline decoration-on-petrol/50 underline-offset-4 hover:decoration-on-petrol">
              {CREDIT_NAME}
            </a>
            {creditAfter}
          </span>
        </p>
      </Container>
    </footer>
  );
}
