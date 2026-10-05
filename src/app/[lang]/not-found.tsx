import Link from "next/link";
import { lang } from "next/root-params";
import { Container } from "@/components/ui";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";

export default async function NotFound() {
  const value = await lang();
  const locale = isLocale(value) ? value : defaultLocale;
  const m = getMessages(locale);
  return (
    <Container className="flex max-w-3xl flex-col gap-4 py-16">
      <h1 className="font-display text-h1 font-bold">{m.notFound.title}</h1>
      <p>{m.notFound.text}</p>
      <p>
        <Link href={localizePath(locale, "/")} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
          {m.notFound.home}
        </Link>
      </p>
    </Container>
  );
}
