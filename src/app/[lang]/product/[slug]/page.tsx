import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { AddToCart } from "@/components/cart/AddToCart";
import { Disclosure } from "@/components/catalog/Disclosure";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { ProductReviews } from "@/components/reviews/ProductReviews";
import { CheckIcon, InfoIcon, ReturnIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { Breadcrumb, Container, StateMessage } from "@/components/ui";
import { categoryByKey } from "@/lib/catalog/assortment";
import { structureDescription } from "@/lib/catalog/description";
import { getProduct, SupplierUnavailableError } from "@/lib/catalog/provider";
import { getProductIntro } from "@/lib/catalog/texts";
import type { Product } from "@/lib/catalog/types";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getMessages, t, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { productShipping } from "@/lib/pricing/shipping";
import { metaDescription, pageMetadata, shareImageUrl, siteUrl } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLd, productJsonLd } from "@/lib/structured-data";

const idFromSlug = (slug: string) => /-(\d+)$/.exec(slug)?.[1] ?? (/^\d+$/.test(slug) ? slug : null);

type Loaded = { kind: "ok"; product: Product } | { kind: "unavailable" } | { kind: "missing" };

async function load(locale: Locale, slug: string): Promise<Loaded> {
  const id = idFromSlug(slug);
  if (!id) return { kind: "missing" };
  try {
    const product = await getProduct(locale, id);
    return product ? { kind: "ok", product } : { kind: "missing" };
  } catch (err) {
    if (err instanceof SupplierUnavailableError) return { kind: "unavailable" };
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/[lang]/product/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const loaded = await load(lang, slug);
  if (loaded.kind !== "ok") return {};
  const p = loaded.product;
  const other = await getProduct(lang === "nl" ? "en" : "nl", p.id);
  const paths = {
    nl: localizePath("nl", `/product/${lang === "nl" ? p.slug : (other?.slug ?? p.slug)}`),
    en: localizePath("en", `/product/${lang === "en" ? p.slug : (other?.slug ?? p.slug)}`),
  };
  const m = getMessages(lang);
  // Price and delivery first: what a searcher decides on. Then as much of the description as fits (src/lib/seo.ts).
  const lead = t(m.product.metaLead, { price: formatMoney(p.price), min: p.delivery.minWorkingDays, max: p.delivery.maxWorkingDays });
  const photo = p.imageUrls[0];
  // The shop's own introduction when there is one: the supplier's text is the same in every shop.
  const intro = await getProductIntro(lang, p.source, p.id);
  return pageMetadata(
    lang,
    paths,
    p.name,
    metaDescription(lead, intro ?? p.description.join(" ")),
    photo ? { url: shareImageUrl(photo), alt: p.name } : undefined,
  );
}

/** The end of a promotion as the visitor reads it: Dutch time, in the page's language. */
const promotionEnd = (locale: Locale, iso: string) =>
  new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** The product page: take away doubt (docs/SCHERMEN.md § Productpagina). */
export default async function ProductPage({ params }: PageProps<"/[lang]/product/[slug]">) {
  // Per request, never prerendered: price, stock and a promotion that starts or ends must be those of now (D-08).
  await connection();
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  const loaded = await load(lang, slug);
  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "unavailable") {
    return (
      <Container className="py-8">
        <StateMessage tone="warning" title={m.product.unavailableTitle} text={m.product.unavailableText} />
      </Container>
    );
  }
  const p = loaded.product;
  // A changed or translated slug redirects with 308 before anything streams.
  if (slug !== p.slug) permanentRedirect(localizePath(lang, `/product/${p.slug}`));

  const category = categoryByKey(p.categoryKey);
  const sub = category?.subcategories.find((s) => s.key === p.subcategoryKey);
  const categoryPath = category ? localizePath(lang, `/${category.slug[lang]}`) : undefined;
  const url = new URL(localizePath(lang, `/product/${p.slug}`), siteUrl).toString();
  const specLabels = m.product.spec as Record<string, string>;
  // Shipping costs before the button (docs/ONDERZOEK.md § 1.2, ACM), from the same rule as the cart.
  const shipping = productShipping(p.shippingAlone);
  const intro = await getProductIntro(lang, p.source, p.id);
  // One list for the visible breadcrumb and its markup, so they cannot differ.
  const crumbs = [
    { href: localizePath(lang, "/"), label: m.meta.siteName },
    ...(category && categoryPath ? [{ href: categoryPath, label: m.categories[category.key as keyof Messages["categories"]].name }] : []),
    ...(category && sub && categoryPath
      ? [{ href: `${categoryPath}/${sub.slug[lang]}`, label: m.subcategories[sub.key as keyof Messages["subcategories"]] }]
      : []),
    { label: p.name },
  ];

  return (
    <Container className="flex flex-col gap-8 py-8">
      <script
        type="application/ld+json"
        // JSON.stringify of our own canonical data; "<" is escaped so a product name cannot close the tag.
        dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(p, url, siteUrl, intro)) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs, siteUrl)) }} />
      <Breadcrumb label={m.a11y.breadcrumb} items={crumbs} />

      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery urls={p.imageUrls} name={p.name} labels={{ ...m.product.gallery, noImage: m.product.noImage }} />

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            {p.brand ? <p className="text-label uppercase text-muted">{p.brand}</p> : null}
            <h1 className="font-display text-h1 font-bold">{p.name}</h1>
          </div>
          {/* The shop's own words, open on the page (the supplier's text folds away below). Plain text, a blank line a new paragraph. */}
          {intro
            ? intro.split("\n\n").map((para, i) => (
                <p key={i} className="max-w-prose whitespace-pre-line">
                  {para}
                </p>
              ))
            : null}

          {/* The buy block: price, stock, delivery, shipping and the button together (docs/SCHERMEN.md). */}
          <section aria-label={m.product.addToCart} className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
            <p className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-h1 font-bold tabular-nums">{formatMoney(p.price)}</span>
                {p.promotion && p.promotion.shownPercent > 0 ? (
                  <span className="rounded-sm bg-brand-soft px-2 py-0.5 font-bold text-foreground ring-1 ring-border">{t(m.product.promotionFlag, { percent: p.promotion.shownPercent })}</span>
                ) : null}
              </span>
              <span className="text-body-sm text-muted">{m.product.inclVat}</span>
              {p.promotion && p.promotion.shownPercent > 0 ? <span className="text-body-sm">{t(m.product.promotionUntil, { date: promotionEnd(lang, p.promotion.endsAt) })}</span> : null}
            </p>
            <ul className="flex flex-col gap-2">
              <li className="flex items-center gap-2 text-in-stock">
                <CheckIcon />
                {m.product.inStock}
              </li>
              <li className="flex items-center gap-2">
                <TruckIcon />
                {/* No country here: the owner wants it only on "Zo werkt WonZo" (2026-11-16, D-13). */}
                <span>{t(m.product.delivery, { min: p.delivery.minWorkingDays, max: p.delivery.maxWorkingDays })}</span>
              </li>
              <li className="flex items-start gap-2">
                <InfoIcon className="mt-0.5 size-5 shrink-0" />
                <span className="tabular-nums">
                  {shipping.kind === "large"
                    ? t(m.product.shippingLarge, { cost: formatMoney(shipping.perPiece) })
                    : t(m.product.shippingStandard, { fee: formatMoney(shipping.fee), freeFrom: formatMoneyShort(shipping.freeFrom) })}
                </span>
              </li>
            </ul>
            <AddToCart
              productId={p.id}
              stock={p.stock}
              cartHref={localizePath(lang, "/winkelwagen")}
              labels={{
                button: m.product.addToCart,
                added: m.cart.added,
                viewCart: m.cart.viewCart,
                tooMany: m.cart.tooMany,
                cartFull: m.cart.cartFull,
                quantity: m.cart.quantity,
                decrease: m.cart.decrease,
                increase: m.cart.increase,
                range: m.cart.range,
              }}
            />
            <p className="flex items-center gap-2 text-body-sm">
              <ReturnIcon className="size-4" />
              {m.product.withdrawal} · {m.product.returns}
            </p>
          </section>
        </div>
      </div>

      {/* Description and specs fold open on request (user 2026-11-16: "like Coolblue and bol"); closed, the page
          stays short. Reviews and the safety block below stay open: GPSR asks for the latter with every offer. */}
      <div className="border-t border-line">
        {p.description.length ? (
          <Disclosure id="description" title={m.product.description}>
            <div className="flex flex-col gap-5">
              {structureDescription(p.description).map((block, i) =>
                block.kind === "text" ? (
                  <p key={i} className="max-w-prose whitespace-pre-line">
                    {block.text}
                  </p>
                ) : (
                  <div key={i} className="flex flex-col gap-2">
                    <h3 className="font-medium">{m.product.features}</h3>
                    <table className="w-full text-body-sm">
                      <tbody>
                        {block.facts.map((f, j) => (
                          <tr key={j} className="border-b border-line align-top">
                            {f.label ? (
                              <th scope="row" className="w-1/3 py-2 pe-4 text-start font-medium">
                                {f.label}
                              </th>
                            ) : (
                              <td className="w-1/3 py-2 pe-4" />
                            )}
                            <td className="py-2">{f.values.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ),
              )}
            </div>
          </Disclosure>
        ) : null}

        <Disclosure id="specs" title={m.product.specs}>
          <table className="w-full text-body-sm">
            <tbody>
              {p.specs.map((s) => (
                <tr key={s.label} className="border-b border-line">
                  <th scope="row" className="w-1/3 py-2 pe-4 text-start font-medium">
                    {specLabels[s.label] ?? s.label}
                  </th>
                  <td className="py-2 tabular-nums">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      </div>

      {/* GPSR art. 19: manufacturer and warnings with every offer (D-34). */}
      <section aria-labelledby="reviews" className="flex flex-col gap-3">
        <h2 id="reviews" className="font-display text-h2">
          {m.reviews.productTitle}
        </h2>
        <ProductReviews source={p.source} productId={p.id} locale={lang} m={m.reviews} />
      </section>

      <section aria-labelledby="safety" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="safety" className="flex items-center gap-2 font-display text-h2">
          <ShieldIcon className="size-6" />
          {m.product.safety}
        </h2>
        {p.safety.manufacturer ? (
          <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-medium">{m.product.manufacturer}</dt>
            <dd>{p.safety.manufacturer.name}</dd>
            {p.safety.manufacturer.address ? (
              <>
                <dt className="font-medium">{m.product.address}</dt>
                <dd>{p.safety.manufacturer.address}</dd>
              </>
            ) : null}
            {p.safety.manufacturer.email ? (
              <>
                <dt className="font-medium">{m.product.email}</dt>
                <dd>{p.safety.manufacturer.email}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        <div className="flex flex-col gap-1 text-body-sm">
          <h3 className="font-medium">{m.product.warnings}</h3>
          {p.safety.warnings.length ? (
            <ul className="list-disc ps-5">
              {p.safety.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{m.product.noWarnings}</p>
          )}
        </div>
      </section>
    </Container>
  );
}
