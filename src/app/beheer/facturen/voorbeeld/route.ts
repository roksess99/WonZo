// GET /beheer/facturen/voorbeeld?soort=credit — an example invoice or credit
// note as PDF, made on the spot from fixed example data: to look at the
// layout before any real invoice exists. Nothing is numbered or stored.

import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { negate } from "@/lib/invoices/document";
import { exampleInvoice } from "@/lib/invoices/example";
import { renderInvoicePdf } from "@/lib/invoices/pdf";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAction("facturen");
  } catch (err) {
    if (err instanceof AdminAccessDenied) return new Response("Niet gevonden", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    throw err;
  }
  const credit = new URL(request.url).searchParams.get("soort") === "credit";
  const base = exampleInvoice(credit ? "credit" : "invoice");
  const pdf = await renderInvoicePdf(credit ? { ...base, ...negate(base) } : base);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="voorbeeld-${base.number}.pdf"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
