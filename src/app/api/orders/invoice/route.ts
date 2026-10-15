// GET /api/orders/invoice?token=…&id=… — the customer's own invoice or credit
// note, with the key from the status link; never with only an invoice number,
// which can be guessed (docs/FACTUUR.md § Toegang). The document must belong
// to the order the key opens (IDOR: fetched within that order). Read-only.

import { getPool, hasDatabase, selectRows } from "@/lib/db";
import { findOrderIdByToken } from "@/lib/orders/store";

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request): Promise<Response> {
  if (!hasDatabase) return notFound();
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!/^[1-9]\d{0,15}$/.test(id)) return notFound();
  const orderId = await findOrderIdByToken(getPool(), token);
  if (!orderId) return notFound();
  const [doc] = await selectRows<{ number: string; kind: string; pdf: Buffer }>(getPool(), "SELECT number, kind, pdf FROM invoices WHERE id = ? AND order_id = ?", [Number(id), orderId]);
  if (!doc) return notFound();
  return new Response(new Uint8Array(doc.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.kind === "credit" ? "creditnota" : "factuur"}-${doc.number}.pdf"`,
      "Cache-Control": "private, no-store",
      // The key is in this URL: it must not travel on in a Referer.
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
