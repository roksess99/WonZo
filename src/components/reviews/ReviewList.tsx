import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/text";

type Review = { id: number; rating: number; body: string | null; name: string | null; reply: string | null; createdAt: Date | string };
type Summary = { count: number; average: number | null; perStar: number[] };

/** Five stars as text and shape: the number is always there for a screen reader, the stars only for the eye. */
export function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="tracking-tight text-accent">
        {"★".repeat(Math.round(rating))}
        <span className="text-line">{"★".repeat(5 - Math.round(rating))}</span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The reviews with their summary (D-12): every published review, low scores
 * too, with how they were collected — that statement is what makes them
 * believable, and the law asks for it (`WETTELIJK`, to be confirmed).
 */
export function ReviewList({ summary, reviews, locale, m }: { summary: Summary; reviews: Review[]; locale: Locale; m: Messages["reviews"] }) {
  const nf = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const date = (d: Date | string) => new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(d));
  if (!summary.count) return <p className="text-muted">{m.none}</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-2">
        <Stars rating={summary.average ?? 0} label={interpolate(m.averageLabel, { average: nf.format(summary.average ?? 0) })} />
        <span className="font-medium">{interpolate(summary.count === 1 ? m.summaryOne : m.summary, { average: nf.format(summary.average ?? 0), count: summary.count })}</span>
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {reviews.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 py-3">
            <p className="flex flex-wrap items-center gap-2">
              <Stars rating={r.rating} label={interpolate(m.ratingLabel, { rating: r.rating })} />
              <span className="font-medium">{r.name || m.anonymous}</span>
              <span className="text-body-sm text-muted">{date(r.createdAt)}</span>
            </p>
            {r.body ? <p className="whitespace-pre-line">{r.body}</p> : null}
            {r.reply ? (
              <div className="ms-4 border-s-2 border-line ps-3 text-body-sm">
                <p className="font-medium">{m.reply}</p>
                <p className="whitespace-pre-line">{r.reply}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-muted">{m.howCollected}</p>
    </div>
  );
}
