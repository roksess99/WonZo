// GET /llms.txt — the shop in short, for language models (src/lib/llms.ts).
// Only our own texts and constants: nothing from a request or a supplier.

import { getMessages } from "@/lib/i18n/messages";
import { llmsText } from "@/lib/llms";
import { siteUrl } from "@/lib/seo";

export function GET(): Response {
  return new Response(llmsText(siteUrl, { nl: getMessages("nl"), en: getMessages("en") }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
