import { notFound } from "next/navigation";
import { CartView } from "@/components/cart/CartView";
import { Breadcrumb, Container } from "@/components/ui";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/winkelwagen">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  // A cart is per visitor: nothing to index.
  return { ...pageMetadata(lang, { nl: "/winkelwagen", en: "/en/cart" }, m.cart.title, m.cart.metaDescription), robots: { index: false } };
}

/**
 * The cart page. Heading and intro are in the first HTML; the cart itself
 * lives in this browser, so its contents render on the client
 * (src/components/cart/CartView.tsx).
 */
export default async function CartPage({ params }: PageProps<"/[lang]/winkelwagen">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  return (
    <Container className="flex flex-col gap-6 py-8">
      <Breadcrumb label={m.a11y.breadcrumb} items={[{ href: localizePath(lang, "/"), label: m.meta.siteName }, { label: m.cart.title }]} />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{m.cart.title}</h1>
        <p className="max-w-prose text-muted">{m.cart.intro}</p>
      </div>
      <CartView
        locale={lang}
        labels={{
          ...m.cart,
          delivery: m.product.delivery,
          shipsFrom: m.product.shipsFrom,
          noImage: m.product.noImage,
          countries: m.countries,
        }}
      />
    </Container>
  );
}
