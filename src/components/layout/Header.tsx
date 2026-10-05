import Image from "next/image";
import Link from "next/link";
import { assortment } from "@/lib/catalog/assortment";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { CartIcon, CheckIcon, SearchIcon } from "../icons";
import { Container } from "../ui";
import { LanguageSwitch } from "./LanguageSwitch";

export function SearchForm({ locale, m, big = false, defaultValue }: { locale: Locale; m: Messages; big?: boolean; defaultValue?: string }) {
  const id = big ? "search-hero" : "search-header";
  return (
    <form role="search" method="get" action={localizePath(locale, "/zoeken")} className="flex w-full">
      <label htmlFor={id} className="sr-only">
        {m.header.searchLabel}
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={m.header.searchPlaceholder}
        autoComplete="off"
        className={`w-full min-w-0 rounded-s-md border border-e-0 border-border bg-surface px-4 ${big ? "min-h-14 text-body" : "min-h-11"}`}
      />
      <button type="submit" className={`inline-flex shrink-0 items-center gap-2 rounded-e-md bg-petrol px-4 font-medium text-on-petrol ${big ? "min-h-14" : "min-h-11"}`}>
        <SearchIcon />
        <span>{m.header.searchButton}</span>
      </button>
    </form>
  );
}

export function Header({ locale, m }: { locale: Locale; m: Messages }) {
  return (
    <header>
      {/* Info bar in petrol (docs/BRAND.md: petrol carries trust). Never orange on petrol (1.97:1). */}
      <div className="on-petrol bg-petrol text-body-sm text-on-petrol">
        <Container className="flex flex-wrap justify-center gap-x-6 gap-y-1 py-2 sm:justify-between">
          {[m.usp.delivery, m.usp.withdrawal, m.usp.ideal].map((u, i) => (
            // Three promises on wide screens, two on a phone, so the bar stays one line.
            <span key={u} className={`items-center gap-1.5 ${i === 2 ? "hidden sm:inline-flex" : "inline-flex"}`}>
              <CheckIcon className="size-4" />
              {u}
            </span>
          ))}
        </Container>
      </div>
      <div className="border-b border-line bg-surface">
        <Container className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
          <Link href={localizePath(locale, "/")} aria-label={m.a11y.home} className="inline-flex min-h-11 items-center">
            <Image src="/brand/wonzo-wordmark.svg" alt="" width={125} height={32} priority unoptimized />
          </Link>
          <div className="order-last w-full md:order-none md:flex-1">
            <SearchForm locale={locale} m={m} />
          </div>
          <div className="ms-auto flex items-center gap-1 md:ms-0">
            <LanguageSwitch locale={locale} label={m.header.language} title={m.header.languageLabel} />
            {/* The cart arrives in fase 2; the link is there so the layout is final. */}
            <span className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-muted" aria-disabled="true">
              <CartIcon />
              <span>{m.header.cart}</span>
            </span>
          </div>
        </Container>
        <Container>
          <nav aria-label={m.header.categories} className="-mx-1 flex gap-1 overflow-x-auto pb-2">
            {assortment.map((c) => (
              <Link
                key={c.key}
                href={localizePath(locale, `/${c.slug[locale]}`)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 font-medium hover:bg-background"
              >
                {m.categories[c.key as keyof Messages["categories"]].name}
              </Link>
            ))}
          </nav>
        </Container>
      </div>
    </header>
  );
}
