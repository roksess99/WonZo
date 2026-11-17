import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ReviewList } from "@/components/reviews/ReviewList";
import { Container } from "@/components/ui";
import { getPool, hasDatabase } from "@/lib/db";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { publicReviews } from "@/lib/reviews";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/beoordelingen">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang).reviews;
  return pageMetadata(lang, { nl: "/beoordelingen", en: "/en/reviews" }, m.shopTitle, m.shopIntro);
}

/** What customers say about WonZo (D-12): all published shop reviews, low scores too. */
export default async function ShopReviewsPage({ params }: PageProps<"/[lang]/beoordelingen">) {
  await connection();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang).reviews;
  const data = hasDatabase
    ? await publicReviews(getPool(), { subject: "shop" }, 100).catch((err: unknown) => {
        console.error("[beoordelingen]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
        return null;
      })
    : { summary: { count: 0, average: null, perStar: [0, 0, 0, 0, 0] }, reviews: [] };
  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{m.shopTitle}</h1>
        <p>{m.shopIntro}</p>
      </div>
      {data ? <ReviewList summary={data.summary} reviews={data.reviews} locale={lang} m={m} /> : <p className="text-muted">{m.error}</p>}
    </Container>
  );
}
