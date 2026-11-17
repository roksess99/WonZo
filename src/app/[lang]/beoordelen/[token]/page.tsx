import { connection } from "next/server";
import { notFound } from "next/navigation";
import { OptOut, ReviewForm } from "@/components/reviews/ReviewForm";
import { Container, StateMessage } from "@/components/ui";
import { getPool, hasDatabase } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { orderByReviewToken, reviewForm } from "@/lib/reviews";

export async function generateMetadata({ params }: PageProps<"/[lang]/beoordelen/[token]">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  // Behind a key: never in a search engine, and the key never in a referrer.
  return { title: getMessages(lang).reviews.formTitle, robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}

/**
 * Reviewing an order (D-12): opened with the key from the invitation, never
 * with an order number. Shows the products bought — no address, no amounts.
 */
export default async function ReviewPage({ params }: PageProps<"/[lang]/beoordelen/[token]">) {
  await connection();
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  const orderId = hasDatabase ? await orderByReviewToken(getPool(), token) : null;
  const form = orderId ? await reviewForm(getPool(), orderId) : null;
  if (!form) {
    return (
      <Container className="py-8">
        <StateMessage tone="warning" title={m.reviews.notFoundTitle} text={m.reviews.notFoundText} action={{ href: localizePath(lang, "/contact"), label: m.contact.title }} />
      </Container>
    );
  }
  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-10">
      <h1 className="font-display text-h1 font-bold">{m.reviews.formTitle}</h1>
      {form.reviewable ? (
        <ReviewForm token={token} reference={form.reference} products={form.products} shopReviewed={form.shopReviewed} m={m.reviews} />
      ) : (
        <p>{m.reviews.notYet}</p>
      )}
      <OptOut token={token} m={m.reviews} />
    </Container>
  );
}
