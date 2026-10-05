import { notFound, permanentRedirect } from "next/navigation";
import { AddToCart } from "@/components/cart/AddToCart";
import { ProductImage } from "@/components/catalog/ProductImage";
import { CheckIcon, InfoIcon, ReturnIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { Breadcrumb, Container, StateMessage } from "@/components/ui";
import { categoryByKey } from "@/lib/catalog/assortment";
import { getProduct, SupplierUnavailableError } from "@/lib/catalog/provider";
import type { Product } from "@/lib/catalog/types";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getMessages, t, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { pageMetadata, siteUrl } from "@/lib/seo";

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
  return pageMetadata(lang, paths, p.name, p.description[0] ?? p.name);
}

function countryName(m: Messages, code: string) {
  return (m.countries as Record<string, string>)[code] ?? code;
}

/** Structured data with price and availability; no rating until there are real reviews (D-12). */
function productJsonLd(p: Product, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    ...(p.ean ? { gtin13: p.ean } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(p.imageUrls[0] ? { image: new URL(p.imageUrls[0], siteUrl).toString() } : {}),
    description: p.description.join(" "),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: p.price.currency,
      price: (p.price.amount / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          transitTime: { "@type": "QuantitativeValue", minValue: p.delivery.minWorkingDays, maxValue: p.delivery.maxWorkingDays, unitCode: "DAY" },
        },
      },
    },
  };
}

/** The product page: take away doubt (docs/SCHERMEN.md § Productpagina). */
export default async function ProductPage({ params }: PageProps<"/[lang]/product/[slug]">) {
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

  return (
    <Container className="flex flex-col gap-8 py-8">
      <script
        type="application/ld+json"
        // JSON.stringify of our own canonical data; "<" is escaped so a product name cannot close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(p, url)).replace(/</g, "\\u003c") }}
      />
      <Breadcrumb
        label={m.a11y.breadcrumb}
        items={[
          { href: localizePath(lang, "/"), label: m.meta.siteName },
          ...(category && categoryPath ? [{ href: categoryPath, label: m.categories[category.key as keyof Messages["categories"]].name }] : []),
          ...(category && sub && categoryPath
            ? [{ href: `${categoryPath}/${sub.slug[lang]}`, label: m.subcategories[sub.key as keyof Messages["subcategories"]] }]
            : []),
          { label: p.name },
        ]}
      />

      <div className="grid gap-8 md:grid-cols-2">
        <ProductImage src={p.imageUrls[0]} alt={p.name} noImageText={m.product.noImage} priority sizes="(min-width: 768px) 50vw, 100vw" />

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            {p.brand ? <p className="text-label uppercase text-muted">{p.brand}</p> : null}
            <h1 className="font-display text-h1 font-bold">{p.name}</h1>
          </div>

          {/* The buy block: price, stock, delivery, shipping and the button together (docs/SCHERMEN.md). */}
          <section aria-label={m.product.addToCart} className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
            <p className="flex flex-col">
              <span className="text-h1 font-bold tabular-nums">{formatMoney(p.price)}</span>
              <span className="text-body-sm text-muted">{m.product.inclVat}</span>
            </p>
            <ul className="flex flex-col gap-2">
              <li className="flex items-center gap-2 text-in-stock">
                <CheckIcon />
                {m.product.inStock}
              </li>
              <li className="flex items-center gap-2">
                <TruckIcon />
                <span>
                  {t(m.product.delivery, { min: p.delivery.minWorkingDays, max: p.delivery.maxWorkingDays })}
                  {" · "}
                  {t(m.product.shipsFrom, { country: countryName(m, p.delivery.shipsFrom) })}
                </span>
              </li>
              <li className="flex items-center gap-2 text-muted">
                <InfoIcon />
                {m.product.shippingCosts}
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

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="specs" className="flex flex-col gap-3">
          <h2 id="specs" className="font-display text-h2">
            {m.product.specs}
          </h2>
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
        </section>

        {p.description.length ? (
          <section aria-labelledby="description" className="flex flex-col gap-3">
            <h2 id="description" className="font-display text-h2">
              {m.product.description}
            </h2>
            <div className="flex max-w-prose flex-col gap-3">
              {p.description.map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* GPSR art. 19: manufacturer and warnings with every offer (D-34). */}
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
