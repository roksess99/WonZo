"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import { alternatePath } from "@/lib/i18n/alternate";
import { GlobeIcon } from "../icons";

/** Links to the same page in the other language. */
export function LanguageSwitch({ locale, label, title }: { locale: Locale; label: string; title: string }) {
  const pathname = usePathname() ?? "/";
  const other: Locale = locale === "nl" ? "en" : "nl";
  return (
    <Link
      href={alternatePath(pathname, other)}
      hrefLang={other}
      lang={other}
      aria-label={title}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 hover:bg-background"
    >
      <GlobeIcon />
      <span>{label}</span>
    </Link>
  );
}
