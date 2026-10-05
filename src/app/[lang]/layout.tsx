import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { isLocale, locales } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { siteUrl } from "@/lib/seo";
import "../globals.css";

// Self-hosted at build time: no request to Google from the visitor's browser
// (docs/BRAND.md § Typografie, docs/PRIVACY.md § Derden in de browser).
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  return {
    metadataBase: siteUrl,
    title: { default: `${m.meta.siteName} — ${m.home.title}`, template: `%s | ${m.meta.siteName}` },
    description: m.meta.description,
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  return (
    <html lang={lang} className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col text-body antialiased">
        <a
          href="#inhoud"
          className="sr-only z-50 rounded-md bg-surface px-4 py-3 font-medium focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          {m.a11y.skipToContent}
        </a>
        <p className="bg-warning-soft px-4 py-2 text-center text-body-sm text-warning" role="note">
          {m.mock.banner}
        </p>
        <Header locale={lang} m={m} />
        <main id="inhoud" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <Footer locale={lang} m={m} />
      </body>
    </html>
  );
}
