import { PriceRulesForm, type PriceGroup } from "@/components/admin/PriceRulesForm";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { assortment } from "@/lib/catalog/assortment";
import { getPricedCatalog, type PricedProduct } from "@/lib/catalog/provider";
import { getPool, hasDatabase } from "@/lib/db";
import { loadPricing, type Pricing } from "@/lib/discounts/store";
import { getMessages } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { euroText, percentText } from "@/lib/pricing/input";
import { subcategoryRuleKey } from "@/lib/pricing/rules";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("prijzen");
  return { title: adminMessages().prices.title };
}

const FLOOR_LIST = 50;

/**
 * The price rule (D-03) with the payment costs that make up the floor
 * (D-16), and where the floor stepped in (docs/PRIJZEN.md). Owner only (D-07).
 */
export default async function PricesPage() {
  await requirePage("prijzen");
  const am = adminMessages();
  const m = am.prices;
  const shop = getMessages("nl");
  let loaded: { pricing: Pricing; entries: PricedProduct[] } | null = null;
  if (hasDatabase) {
    try {
      const [pricing, entries] = await Promise.all([loadPricing(getPool(), new Date()), getPricedCatalog("nl")]);
      loaded = { pricing, entries };
    } catch (err) {
      console.error("[beheer/prijzen]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
    }
  }

  if (!loaded) {
    return (
      <>
        <h1 className="font-display text-h1 font-bold">{m.title}</h1>
        <p role="alert" className="font-medium text-danger">
          {am.dashboard.loadError}
        </p>
      </>
    );
  }

  const { pricing, entries } = loaded;
  const count = new Map<string, number>();
  for (const e of entries) {
    const k = subcategoryRuleKey(e.product.categoryKey, e.product.subcategoryKey);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const subName = shop.subcategories as Record<string, string>;
  const catName = shop.categories as Record<string, { name: string }>;
  const groups: PriceGroup[] = assortment.flatMap((c) =>
    c.subcategories.map((s) => {
      const key = subcategoryRuleKey(c.key, s.key);
      const first = entries.find((e) => subcategoryRuleKey(e.product.categoryKey, e.product.subcategoryKey) === key);
      return {
        key,
        label: `${catName[c.key]?.name ?? c.key} › ${subName[s.key] ?? s.key}`,
        markup: percentText(pricing.rules.markups.get(key) ?? null),
        products: count.get(key) ?? 0,
        example: first ? { name: first.product.name, input: first.input } : null,
      };
    }),
  );
  const floored = entries.filter((e) => e.pricing.raisedToFloor);

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
      <section aria-label={m.title} className="rounded-md bg-surface p-6 ring-1 ring-line">
        <PriceRulesForm
          version={pricing.version}
          defaultMarkup={percentText(pricing.rules.defaultMarkupBp)}
          paymentCost={euroText(pricing.rules.paymentCostCents)}
          groups={groups}
          m={m}
          busy={am.actions.busy}
        />
      </section>
      <section aria-labelledby="floor" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="floor" className="font-display text-h2 font-bold">
          {m.floorTitle}
        </h2>
        <p className="text-body-sm text-muted">{interpolate(m.count, { count: entries.length, floor: floored.length })}</p>
        {floored.length ? (
          <>
            <p className="max-w-prose">{m.floorIntro}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem]">
                <thead>
                  <tr className="border-b border-line text-body-sm text-muted">
                    <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colProduct}</th>
                    <th scope="col" className="py-2 text-end font-medium">{m.colFloor}</th>
                  </tr>
                </thead>
                <tbody>
                  {floored.slice(0, FLOOR_LIST).map((e) => (
                    <tr key={e.product.id} className="border-b border-line last:border-b-0">
                      <td className="py-2 pe-4">
                        {e.product.name} <span className="text-body-sm text-muted tabular-nums">{e.product.sku}</span>
                      </td>
                      <td className="py-2 text-end tabular-nums">{formatMoney(e.pricing.floor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {floored.length > FLOOR_LIST ? <p className="text-body-sm text-muted">{interpolate(m.floorMore, { count: floored.length - FLOOR_LIST })}</p> : null}
          </>
        ) : (
          <p>{m.floorNone}</p>
        )}
      </section>
    </>
  );
}
