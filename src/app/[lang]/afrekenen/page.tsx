import { notFound } from "next/navigation";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { Breadcrumb, Container, StateMessage } from "@/components/ui";
import { checkoutAvailable } from "@/lib/checkout";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/afrekenen">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  // Per visitor: nothing to index.
  return { ...pageMetadata(lang, { nl: "/afrekenen", en: "/en/checkout" }, m.checkout.title, m.checkout.metaDescription), robots: { index: false } };
}

/**
 * The checkout page (docs/SCHERMEN.md § Afrekenen). Heading and intro in the
 * first HTML; the cart lives in this browser, so the form renders on the
 * client. Off until launch (CHECKOUT_ENABLED): then an honest "not yet".
 */
export default async function CheckoutPage({ params }: PageProps<"/[lang]/afrekenen">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  return (
    <Container className="flex flex-col gap-6 py-8">
      <Breadcrumb
        label={m.a11y.breadcrumb}
        items={[{ href: localizePath(lang, "/"), label: m.meta.siteName }, { href: localizePath(lang, "/winkelwagen"), label: m.cart.title }, { label: m.checkout.title }]}
      />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{m.checkout.title}</h1>
        <p className="max-w-prose text-muted">{m.checkout.intro}</p>
      </div>
      {checkoutAvailable() ? (
        <CheckoutView
          locale={lang}
          labels={{
            ...m.checkout,
            loading: m.cart.loading,
            emptyTitle: m.cart.emptyTitle,
            emptyText: m.cart.emptyText,
            emptyAction: m.cart.emptyAction,
            subtotal: m.cart.subtotal,
            subtotalOne: m.cart.subtotalOne,
            shipping: m.cart.shipping,
            shippingLarge: m.cart.shippingLarge,
            shippingFree: m.cart.shippingFree,
            total: m.cart.total,
            inclVat: m.cart.inclVat,
            delivery: m.product.delivery,
            shipsFrom: m.product.shipsFrom,
            resolveFirst: m.cart.resolveFirst,
            countries: m.countries,
          }}
        />
      ) : (
        <StateMessage title={m.checkout.off} action={{ href: localizePath(lang, "/winkelwagen"), label: m.checkout.backToCart }} />
      )}
    </Container>
  );
}
