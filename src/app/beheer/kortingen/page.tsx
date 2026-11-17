import { dateTime } from "@/components/admin/format";
import { NewCodeForm, StopCode } from "@/components/admin/CodeForms";
import { NewPromotionForm, StopPromotion } from "@/components/admin/PromotionForms";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { assortment } from "@/lib/catalog/assortment";
import { getPricedCatalog, type PricedProduct } from "@/lib/catalog/provider";
import { instantToAmsterdamLocal } from "@/lib/dates";
import { getPool, hasDatabase } from "@/lib/db";
import { listCodes, type CodeListRow } from "@/lib/discounts/codes";
import { listPromotions, type PromotionListRow } from "@/lib/discounts/store";
import { euroText } from "@/lib/pricing/input";
import { getMessages } from "@/lib/i18n/messages";
import { subcategoryRuleKey } from "@/lib/pricing/rules";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("kortingen");
  return { title: adminMessages().promotions.title };
}

/**
 * Promotions (D-08, docs/BEHEER.md § Kortingen en acties): on a category, a
 * subcategory or one product, the highest wins; stopping keeps the row; and
 * per promotion where the floor made it smaller or left no room
 * (docs/PRIJZEN.md § 2: otherwise the panel says 20 % while the customer sees 9 %).
 * And the discount codes (docs/PRIJZEN.md § 3), with how often each was used.
 * Owner and marketing (D-07).
 */
export default async function PromotionsPage() {
  await requirePage("kortingen");
  const am = adminMessages();
  const m = am.promotions;
  const shop = getMessages("nl");
  const now = new Date();
  const mc = am.codes;
  let loaded: { rows: PromotionListRow[]; entries: PricedProduct[]; codes: CodeListRow[] } | null = null;
  if (hasDatabase) {
    try {
      const [rows, entries, codes] = await Promise.all([listPromotions(getPool(), now), getPricedCatalog("nl"), listCodes(getPool(), now)]);
      loaded = { rows, entries, codes };
    } catch (err) {
      console.error("[beheer/kortingen]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
    }
  }

  const catName = shop.categories as Record<string, { name: string }>;
  const subName = shop.subcategories as Record<string, string>;
  const categories = assortment.map((c) => ({ key: c.key, label: catName[c.key]?.name ?? c.key }));
  const subcategories = assortment.flatMap((c) => c.subcategories.map((s) => ({ key: subcategoryRuleKey(c.key, s.key), label: `${catName[c.key]?.name ?? c.key} › ${subName[s.key] ?? s.key}` })));

  const header = (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
    </>
  );
  if (!loaded) {
    return (
      <>
        {header}
        <p role="alert" className="font-medium text-danger">
          {am.dashboard.loadError}
        </p>
      </>
    );
  }

  const { rows, entries, codes } = loaded;
  const products = new Map(entries.map((e) => [e.product.id, e.product]));
  const targetText = (r: PromotionListRow) => {
    const t = r.target;
    const name =
      t.kind === "category"
        ? (categories.find((c) => c.key === t.key)?.label ?? t.key)
        : t.kind === "subcategory"
          ? (subcategories.find((c) => c.key === t.key)?.label ?? t.key)
          : (() => {
              const p = products.get(t.key);
              return p ? `${p.name} (${p.sku})` : interpolate(m.unknownProduct, { id: t.key });
            })();
    return interpolate(m.target, { kind: m.kind[t.kind], name });
  };
  const effect = (id: string) => ({
    applied: entries.filter((e) => e.pricing.promotion?.id === id).length,
    limited: entries.filter((e) => e.pricing.promotion?.id === id && e.pricing.promotion.limited).length,
    blocked: entries.filter((e) => e.pricing.blockedPromotion?.id === id).length,
  });
  const pct = (bp: number) => `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(bp / 100)} %`;
  const hour = Math.ceil(now.getTime() / 3_600_000) * 3_600_000;
  const nextHour = instantToAmsterdamLocal(new Date(hour));
  const weekLater = instantToAmsterdamLocal(new Date(hour + 7 * 86_400_000));
  const openCodes = codes.filter((c) => c.state !== "ended");
  const endedCodes = codes.filter((c) => c.state === "ended");
  const codeCard = (c: CodeListRow) => (
    <article key={c.id} aria-labelledby={`code-${c.id}`} className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0 last:pb-0">
      <h4 id={`code-${c.id}`} className="flex flex-wrap items-baseline gap-x-3 font-medium">
        <span className="font-bold tabular-nums">{c.code}</span>
        <span className="rounded-sm bg-background px-2 py-0.5 text-body-sm ring-1 ring-line">{m.state[c.state]}</span>
        <span className="tabular-nums">{pct(c.percentBp)}</span>
      </h4>
      <p>
        {interpolate(mc.conditions, {
          min: c.minSubtotalCents ? interpolate(mc.withMin, { amount: euroText(c.minSubtotalCents) }) : mc.noMin,
          max: c.maxUses === null ? mc.noMax : interpolate(mc.withMax, { count: c.maxUses }),
        })}
      </p>
      <p className="text-body-sm text-muted">{interpolate(m.period, { from: dateTime(c.startsAt), to: dateTime(c.endsAt) })}</p>
      <p className="text-body-sm tabular-nums">{c.maxUses === null ? interpolate(mc.uses, { count: c.uses }) : interpolate(mc.usesOf, { count: c.uses, max: c.maxUses })}</p>
      <p className="text-body-sm text-muted">
        {interpolate(m.createdBy, { date: dateTime(c.createdAt) })}
        {c.stoppedAt ? ` · ${interpolate(m.stoppedOn, { date: dateTime(c.stoppedAt) })}` : ""}
      </p>
      {c.state !== "ended" ? <StopCode codeId={c.id} m={mc} busy={am.actions.busy} /> : null}
    </article>
  );
  const open = rows.filter((r) => r.state !== "ended");
  const ended = rows.filter((r) => r.state === "ended");

  const card = (r: PromotionListRow) => {
    const fx = r.state === "running" ? effect(r.id) : null;
    return (
      <article key={r.id} aria-labelledby={`promotion-${r.id}`} className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0 last:pb-0">
        <h3 id={`promotion-${r.id}`} className="flex flex-wrap items-baseline gap-x-3 font-medium">
          <span className="font-bold">{r.name}</span>
          <span className="rounded-sm bg-background px-2 py-0.5 text-body-sm ring-1 ring-line">{m.state[r.state]}</span>
          <span className="tabular-nums">{pct(r.percentBp)}</span>
        </h3>
        <p>{targetText(r)}</p>
        <p className="text-body-sm text-muted">{interpolate(m.period, { from: dateTime(r.startsAt), to: dateTime(r.endsAt) })}</p>
        {fx ? (
          <ul className="flex flex-col gap-1 text-body-sm">
            <li>{interpolate(m.effect, { count: fx.applied })}</li>
            {fx.limited ? <li className="font-medium text-warning">{interpolate(m.limited, { count: fx.limited })}</li> : null}
            {fx.blocked ? <li className="font-medium text-warning">{interpolate(m.blocked, { count: fx.blocked })}</li> : null}
          </ul>
        ) : null}
        <p className="text-body-sm text-muted">
          {interpolate(m.createdBy, { date: dateTime(r.createdAt) })}
          {r.stoppedAt ? ` · ${interpolate(m.stoppedOn, { date: dateTime(r.stoppedAt) })}` : ""}
        </p>
        {r.state !== "ended" ? <StopPromotion promotionId={r.id} m={m} busy={am.actions.busy} /> : null}
      </article>
    );
  };

  return (
    <>
      {header}
      <section aria-labelledby="new-promotion" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="new-promotion" className="font-display text-h2 font-bold">
          {m.newTitle}
        </h2>
        <NewPromotionForm
          categories={categories}
          subcategories={subcategories}
          start={nextHour}
          end={weekLater}
          m={m}
          busy={am.actions.busy}
        />
      </section>
      <section aria-labelledby="open-promotions" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="open-promotions" className="font-display text-h2 font-bold">
          {m.openTitle}
        </h2>
        {open.length ? open.map(card) : <p>{m.none}</p>}
      </section>
      <section aria-labelledby="ended-promotions" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="ended-promotions" className="font-display text-h2 font-bold">
          {m.endedTitle}
        </h2>
        {ended.length ? ended.map(card) : <p>{m.noneEnded}</p>}
      </section>
      <h2 className="font-display text-h1 font-bold">{mc.title}</h2>
      <p className="max-w-prose text-muted">{mc.intro}</p>
      <section aria-labelledby="new-code" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h3 id="new-code" className="font-display text-h2 font-bold">
          {mc.newTitle}
        </h3>
        <NewCodeForm start={nextHour} end={weekLater} m={mc} busy={am.actions.busy} />
      </section>
      <section aria-labelledby="open-codes" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h3 id="open-codes" className="font-display text-h2 font-bold">
          {mc.openTitle}
        </h3>
        {openCodes.length ? openCodes.map(codeCard) : <p>{mc.none}</p>}
      </section>
      <section aria-labelledby="ended-codes" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h3 id="ended-codes" className="font-display text-h2 font-bold">
          {mc.endedTitle}
        </h3>
        {endedCodes.length ? endedCodes.map(codeCard) : <p>{mc.noneEnded}</p>}
      </section>
    </>
  );
}
