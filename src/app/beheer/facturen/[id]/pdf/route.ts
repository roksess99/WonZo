// GET /beheer/facturen/<id>/pdf — the stored PDF, for the admin with the
// "facturen" permission. A route handler gets no protection from a layout:
// the check is here, by hand (docs/BEHEER.md § Lessen: an invoice route that
// only asked "is someone logged in" let anyone count through the numbers).

import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { getPool, hasDatabase } from "@/lib/db";
import { invoicePdf } from "@/lib/invoices";

const notFound = () => new Response("Niet gevonden", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(_request: Request, ctx: RouteContext<"/beheer/facturen/[id]/pdf">): Promise<Response> {
  try {
    await requireAction("facturen");
  } catch (err) {
    // The same answer as an unknown id: the route does not exist for a stranger.
    if (err instanceof AdminAccessDenied) return notFound();
    throw err;
  }
  const { id } = await ctx.params;
  if (!/^[1-9]\d{0,15}$/.test(id) || !hasDatabase) return notFound();
  const doc = await invoicePdf(getPool(), Number(id));
  if (!doc) return notFound();
  return new Response(new Uint8Array(doc.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.kind === "credit" ? "creditnota" : "factuur"}-${doc.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
