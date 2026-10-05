import { notFound } from "next/navigation";
import { ReturnIcon, ShieldIcon, TruckIcon, CheckIcon } from "@/components/icons";
import { Container } from "@/components/ui";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/zo-werkt-wonzo">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  return pageMetadata(lang, { nl: "/zo-werkt-wonzo", en: "/en/how-wonzo-works" }, m.howItWorks.title, m.howItWorks.intro);
}

/** Where products come from and how long they take — trust, and ACM (docs/ONDERZOEK.md § 1.1). */
export default async function HowItWorks({ params }: PageProps<"/[lang]/zo-werkt-wonzo">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const h = getMessages(lang).howItWorks;
  const blocks = [
    { Icon: ShieldIcon, title: h.sourceTitle, text: h.sourceText },
    { Icon: TruckIcon, title: h.deliveryTitle, text: h.deliveryText },
    { Icon: CheckIcon, title: h.stockTitle, text: h.stockText },
    { Icon: ReturnIcon, title: h.returnsTitle, text: h.returnsText },
  ];
  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{h.title}</h1>
        <p className="text-muted">{h.intro}</p>
      </div>
      {blocks.map(({ Icon, title, text }) => (
        <section key={title} className="flex gap-4">
          <Icon className="mt-1 size-6 shrink-0 text-petrol" />
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-h2">{title}</h2>
            <p className="max-w-prose">{text}</p>
          </div>
        </section>
      ))}
    </Container>
  );
}
