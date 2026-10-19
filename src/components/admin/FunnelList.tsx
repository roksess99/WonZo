import type { AdminMessages } from "@/lib/admin/messages";
import type { Funnel } from "@/lib/stats";
import { interpolate } from "@/lib/text";

/** The four steps with their numbers; page views, not people — the note says so. */
export function FunnelList({ f, days, m }: { f: Funnel; days: number; m: AdminMessages["stats"] }) {
  const nf = new Intl.NumberFormat("nl-NL");
  const steps = [
    [m.funnelCart, f.cart],
    [m.funnelCheckout, f.checkout],
    [m.funnelStarted, f.started],
    [m.funnelPaid, f.paid],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1 tabular-nums">
        {steps.map(([label, n]) => (
          <li key={label} className="flex justify-between gap-4 border-b border-line py-1">
            <span>{label}</span>
            <span className="font-medium">{nf.format(n)}</span>
          </li>
        ))}
      </ol>
      <p className="text-body-sm text-muted">{interpolate(m.funnelNote, { days })}</p>
    </div>
  );
}
