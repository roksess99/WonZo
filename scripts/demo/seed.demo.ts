// Demo data for the panel in the DEV database (vitest.demo.config.ts refuses
// any other): about twenty orders spread over the last four weeks, each made
// by the shop's own code — placing, paying (a stand-in for Mollie), the
// cancel window, invoicing, purchasing and tracking (a stand-in for BigBuy),
// returns with a credit note, reviews with a reply and one hidden, a held
// order, a purchase that is too expensive, one that keeps failing, statistics
// for 30 days, and two more admins. Customers are made up (example.com
// addresses, never delivered). Nothing reaches Mollie, BigBuy or a mail
// server: the mail the steps queue is marked as sent at the end.
//
// Run once, by the owner: `pnpm demo:seed`. A second run adds a second set.

import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { acceptInvite, inviteAdmin, issueInvite } from "@/lib/admin/auth";
import { adminKey, base32Decode, newTotpSecret, sealPending, sha256, totpCode, totpStep } from "@/lib/admin/crypto";
import { getCatalog } from "@/lib/catalog/provider";
import type { Product } from "@/lib/catalog/types";
import { getPool, selectRows, toDbTime, withTransaction } from "@/lib/db";
import { runInvoicing } from "@/lib/invoices";
import { MAIL_KINDS } from "@/lib/mail/worker";
import { money } from "@/lib/money";
import { placeOrder, releaseClosedWindows } from "@/lib/orders";
import { runPurchasing } from "@/lib/orders/purchasing";
import { runTracking } from "@/lib/orders/tracking";
import { cancelByCustomer, expireUnpaidOrders, handleWebhook, reconcile, startPayment } from "@/lib/payments";
import { receiveReturn, refundReturn, rejectReturn, requestReturn, settleReturns } from "@/lib/returns";
import { issueReviewToken, replyToReview, runReviewInvites, setReviewVisibility, submitReviews } from "@/lib/reviews";
import { amsterdamDay } from "@/lib/stats";
import { FakeBigBuy } from "../../tests/integration/fake-bigbuy";
import { FakeMollie } from "../../tests/integration/fake-mollie";

afterAll(async () => {
  await getPool().end();
});

const NOW = new Date();
const minutes = (from: Date, n: number) => new Date(from.getTime() + n * 60_000);
const hours = (from: Date, n: number) => minutes(from, n * 60);
/** n days ago at the given hour (UTC). */
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  d.setUTCHours(hour, (n * 7) % 60, 0, 0);
  return d;
};

const mollie = new FakeMollie();
const bigbuy = new FakeBigBuy();
// Its own range of supplier order numbers: never the same as a number from an earlier run.
(bigbuy as unknown as { seq: number }).seq = 700_000_000 + Math.floor(Math.random() * 99_000_000);
const urls = { redirectUrl: "https://wonzo.nl/bestelling/demo", webhookUrl: "https://wonzo.nl/api/payments/webhook" };

type Customer = { firstName: string; lastName: string; street: string; houseNumber: string; postcode: string; city: string };
const people: Customer[] = [
  { firstName: "Sanne", lastName: "de Vries", street: "Kerkstraat", houseNumber: "12", postcode: "6811 DM", city: "Arnhem" },
  { firstName: "Thomas", lastName: "Bakker", street: "Oudegracht", houseNumber: "141", postcode: "3511 AP", city: "Utrecht" },
  { firstName: "Emma", lastName: "Clarke", street: "Prinsengracht", houseNumber: "263", postcode: "1016 GV", city: "Amsterdam" },
  { firstName: "Lars", lastName: "Visser", street: "Grote Markt", houseNumber: "8", postcode: "9711 LV", city: "Groningen" },
  { firstName: "Noor", lastName: "Jansen", street: "Stationsweg", houseNumber: "44", postcode: "2515 BN", city: "Den Haag" },
  { firstName: "Daan", lastName: "Smit", street: "Lange Nieuwstraat", houseNumber: "3", postcode: "3512 PA", city: "Utrecht" },
  { firstName: "Julia", lastName: "Meijer", street: "Wilhelminapark", houseNumber: "19", postcode: "5041 EB", city: "Tilburg" },
  { firstName: "Bram", lastName: "de Boer", street: "Molenweg", houseNumber: "7", postcode: "6542 PS", city: "Nijmegen" },
  { firstName: "Lotte", lastName: "Mulder", street: "Zeestraat", houseNumber: "88", postcode: "2042 LC", city: "Zandvoort" },
  { firstName: "Ruben", lastName: "Hendriks", street: "Dorpsstraat", houseNumber: "21", postcode: "6871 AC", city: "Renkum" },
  { firstName: "Sophie", lastName: "Vos", street: "Vismarkt", houseNumber: "5", postcode: "4811 WD", city: "Breda" },
  { firstName: "Milan", lastName: "Dekker", street: "Hoogstraat", houseNumber: "102", postcode: "3011 PT", city: "Rotterdam" },
  { firstName: "Eva", lastName: "Peters", street: "Markt", houseNumber: "15", postcode: "6211 CK", city: "Maastricht" },
  { firstName: "Sem", lastName: "van Dijk", street: "Beukenlaan", houseNumber: "30", postcode: "5651 CE", city: "Eindhoven" },
  { firstName: "Anouk", lastName: "Koster", street: "Parkweg", houseNumber: "9", postcode: "7411 SH", city: "Deventer" },
  { firstName: "Jesse", lastName: "Willems", street: "Steenweg", houseNumber: "60", postcode: "5211 JL", city: "Den Bosch" },
  { firstName: "Mila", lastName: "de Graaf", street: "Bloemstraat", houseNumber: "2", postcode: "8011 JM", city: "Zwolle" },
  { firstName: "Tim", lastName: "Bos", street: "Havenkade", houseNumber: "17", postcode: "1131 EP", city: "Volendam" },
  { firstName: "Iris", lastName: "Smeets", street: "Rijnstraat", houseNumber: "51", postcode: "6811 EV", city: "Arnhem" },
  { firstName: "Kees", lastName: "Prins", street: "Brink", houseNumber: "4", postcode: "7411 BR", city: "Deventer" },
  { firstName: "Fenna", lastName: "Brouwer", street: "Westersingel", houseNumber: "70", postcode: "9718 CK", city: "Groningen" },
];
const customerOf = (c: Customer, n: number) => ({
  ...c,
  email: `${c.firstName}.${c.lastName}`.toLowerCase().replace(/[^a-z.]/g, "") + `.demo${n}@example.com`,
  phone: `06${String(20_000_000 + n * 1_234_567).slice(0, 8)}`,
});

type Placed = { orderId: number; reference: string; email: string; lines: { source: string; productId: string }[] };

async function place(at: Date, who: number, items: { p: Product; quantity: number }[], locale: "nl" | "en" = "nl"): Promise<Placed> {
  const customer = customerOf(people[who]!, who);
  const lines = items.map((i) => ({ source: i.p.source, productId: i.p.id, quantity: i.quantity }));
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale, lines, customer }, at);
  if (r.kind !== "placed") throw new Error(`placing for ${customer.firstName}: ${JSON.stringify(r)}`);
  return { orderId: r.orderId, reference: r.reference, email: customer.email, lines };
}

async function pay(o: Placed, at: Date) {
  await startPayment({ orderId: o.orderId, ...urls, now: at }, mollie);
  const tr = mollie.idOfOrder(o.orderId);
  mollie.setStatus(tr, "paid");
  await handleWebhook(tr, mollie, minutes(at, 1));
}

/** Past the 30-minute window: the invoice, and the purchase at the supplier. */
async function release(at: Date) {
  await releaseClosedWindows(at);
  await runInvoicing(at);
  await runPurchasing(bigbuy, at);
}

async function supplierRef(orderId: number): Promise<string> {
  const [s] = await selectRows<{ ref: string | null }>(getPool(), "SELECT supplier_order_ref AS ref FROM supplier_orders WHERE order_id = ?", [orderId]);
  if (!s?.ref) throw new Error(`no purchase for order ${orderId}`);
  return s.ref;
}

let parcelNo = 4_100_000;
async function ship(o: Placed, at: Date, deliveredAt?: Date) {
  const ref = await supplierRef(o.orderId);
  const trackingNumber = `ES${7_700_000_000 + parcelNo++}`;
  bigbuy.parcels.set(ref, [{ trackingNumber, carrier: "GLS", statusText: "in transit", statusAt: null, delivered: false }]);
  await runTracking(bigbuy, at);
  if (deliveredAt) {
    bigbuy.parcels.set(ref, [{ trackingNumber, carrier: "GLS", statusText: "delivered", statusAt: deliveredAt, delivered: true }]);
    await runTracking(bigbuy, minutes(deliveredAt, 30));
  }
}

/** Placed, paid, released, shipped and (optionally) delivered: the normal life of an order. */
async function fullOrder(day: number, who: number, items: { p: Product; quantity: number }[], opts: { deliver?: boolean; ship?: boolean; locale?: "nl" | "en" } = {}) {
  const t = daysAgo(day, 9 + (who % 9));
  const o = await place(t, who, items, opts.locale);
  await pay(o, minutes(t, 2));
  await release(minutes(t, 40));
  if (opts.ship !== false) await ship(o, hours(t, 26), opts.deliver === false ? undefined : hours(t, 74));
  return o;
}

const invoiceOf = async (orderId: number) => (await selectRows<{ number: string }>(getPool(), "SELECT number FROM invoices WHERE order_id = ? AND kind = 'invoice'", [orderId]))[0]!.number;
const returnOf = async (orderId: number) =>
  (await selectRows<{ id: number | string; status: string; max: number | string }>(getPool(), "SELECT id, status, lines_cents + shipping_cents AS max FROM returns WHERE order_id = ? ORDER BY id DESC LIMIT 1", [orderId]))[0]!;

async function review(o: Placed, at: Date, shop: { rating: number; body: string } | null, product: { rating: number; body: string } | null, displayName: string | null) {
  const token = await withTransaction((conn) => issueReviewToken(conn, o.orderId, at));
  const first = o.lines[0]!;
  const r = await submitReviews({ token, shop: shop ?? undefined, products: product ? { [`${first.source}:${first.productId}`]: product } : undefined, displayName }, at);
  expect(r.kind).toBe("done");
}

it("fills the dev database with a month of demo data", async () => {
  const pool = getPool();
  const [{ start } = { start: 0 }] = await selectRows<{ start: number | string }>(pool, "SELECT COALESCE(MAX(id), 0) AS start FROM outbox");
  const [owner] = await selectRows<{ id: number | string }>(pool, "SELECT id FROM admins WHERE role = 'eigenaar' AND disabled_at IS NULL AND password_hash IS NOT NULL ORDER BY id LIMIT 1").catch(() => []);
  const actor = owner ? `admin:${owner.id}` : "admin:dev";

  // ---- products: what the dev shop sells now, in stock; a large item for the furniture order
  const catalog = (await getCatalog("nl")).filter((p) => p.stock >= 5).sort((a, b) => a.id.localeCompare(b.id));
  const small = catalog.filter((p) => p.shippingAlone.amount <= 1500);
  const large = catalog.filter((p) => p.shippingAlone.amount > 1500);
  if (small.length < 6) throw new Error(`Too few products in stock in the dev catalogue (${small.length}).`);
  const pick = (n: number) => small[(n * 7) % small.length]!;
  const big = large[0] ?? pick(11);

  // ---- delivered orders, oldest first
  const o1 = await fullOrder(27, 0, [{ p: pick(1), quantity: 2 }, { p: pick(2), quantity: 1 }]);
  const o2 = await fullOrder(25, 1, [{ p: pick(3), quantity: 1 }]);
  const o3 = await fullOrder(24, 2, [{ p: pick(4), quantity: 1 }], { locale: "en" });
  const o4 = await fullOrder(22, 3, [{ p: pick(5), quantity: 1 }, { p: pick(6), quantity: 2 }]);
  const o5 = await fullOrder(20, 4, [{ p: pick(7), quantity: 1 }]);
  const o6 = await fullOrder(19, 5, [{ p: pick(8), quantity: 1 }]);
  const o7 = await fullOrder(18, 6, [{ p: pick(9), quantity: 3 }]);
  const o8 = await fullOrder(16, 7, [{ p: pick(10), quantity: 1 }]);
  const o9 = await fullOrder(15, 8, [{ p: pick(12), quantity: 2 }]);
  await fullOrder(13, 9, [{ p: pick(13), quantity: 1 }]);
  await fullOrder(12, 2, [{ p: pick(14), quantity: 1 }, { p: pick(15), quantity: 1 }], { locale: "en" });
  await fullOrder(9, 10, [{ p: pick(16), quantity: 1 }]);
  // On their way, and bought at the supplier but not shipped yet.
  await fullOrder(7, 11, [{ p: pick(17), quantity: 1 }], { deliver: false });
  await fullOrder(5, 12, [{ p: pick(18), quantity: 2 }], { deliver: false });
  await fullOrder(4, 13, [{ p: pick(19), quantity: 1 }], { ship: false });
  await fullOrder(3, 14, [{ p: big, quantity: 1 }], { ship: false });

  // ---- returns (D-09): refunded with a deduction and a credit note; rejected; received; requested
  const ret = async (o: Placed, at: Date, reason: "none" | "wrong" | "damaged" | "defect", note: string | null) => {
    const r = await requestReturn({ email: o.email, invoice: await invoiceOf(o.orderId), lines: [{ lineNo: 1, quantity: 1, reason }], note: note ?? undefined }, at);
    expect(r.kind).toBe("requested");
    return returnOf(o.orderId);
  };
  const r4 = await ret(o4, daysAgo(17, 11), "none", null);
  await receiveReturn({ returnId: Number(r4.id), expectedStatus: "REQUESTED", actor, now: daysAgo(14, 9) });
  await refundReturn({ returnId: Number(r4.id), expectedMaxCents: Number(r4.max), refundCents: Number(r4.max) - 500, deductionReason: "Verpakking ontbrak; product onbeschadigd", actor, now: daysAgo(14, 10) }, mollie);
  mollie.settleRefunds();
  // Mollie's answer reaches the refund through reconciliation; then the return is REFUNDED and gets its credit note.
  await reconcile(mollie, daysAgo(14, 12));
  await settleReturns(daysAgo(14, 13));
  await runInvoicing(daysAgo(14, 13));

  const r6 = await ret(o6, daysAgo(15, 15), "none", "Past toch niet in de kamer.");
  await receiveReturn({ returnId: Number(r6.id), expectedStatus: "REQUESTED", actor, now: daysAgo(12, 9) });
  await rejectReturn({ returnId: Number(r6.id), expectedStatus: "RECEIVED", reason: "Het artikel is duidelijk gebruikt en de onderdelen ontbreken. We sturen het terug.", actor, now: daysAgo(12, 10) });

  const r8 = await ret(o8, daysAgo(12, 16), "defect", "Het scharnier is na twee dagen afgebroken.");
  await receiveReturn({ returnId: Number(r8.id), expectedStatus: "REQUESTED", actor, now: daysAgo(4, 11) });
  await ret(o9, daysAgo(2, 19), "wrong", "Ik kreeg de verkeerde kleur.");

  // ---- reviews (D-12): winkel en artikel, een antwoord, één verborgen, één laag zonder antwoord
  await review(o1, daysAgo(17, 20), { rating: 5, body: "Snel geleverd en netjes verpakt. De levertijd klopte precies." }, { rating: 5, body: "Precies zoals op de foto, stevig." }, "Sanne");
  await review(o2, daysAgo(15, 18), { rating: 4, body: "Goede prijs. Bezorging duurde een dag langer dan gedacht." }, null, "Thomas B.");
  await review(o3, daysAgo(13, 21), null, { rating: 5, body: "Great quality for the price, would order again." }, "Emma");
  await review(o5, daysAgo(9, 12), { rating: 2, body: "Het pakket was beschadigd aan de buitenkant en ik heb lang moeten wachten." }, null, null);
  await review(o7, daysAgo(7, 22), { rating: 3, body: "Prima, maar bel me even op 06-12345678 als het opnieuw gebeurt." }, { rating: 4, body: "Doet wat het moet doen." }, "Julia");
  const [r1] = await selectRows<{ id: number | string }>(pool, "SELECT id FROM reviews WHERE order_id = ? AND subject = 'shop'", [o1.orderId]);
  await replyToReview({ reviewId: Number(r1!.id), reply: "Dank je wel, Sanne! Fijn dat alles goed aankwam.", actor, now: daysAgo(16, 9) });
  const [r7] = await selectRows<{ id: number | string }>(pool, "SELECT id FROM reviews WHERE order_id = ? AND subject = 'shop'", [o7.orderId]);
  await setReviewVisibility({ reviewId: Number(r7!.id), hide: true, reason: "Bevat een telefoonnummer (persoonsgegeven)", actor, now: daysAgo(6, 9) });

  // ---- what asks for attention
  // Not paid, expired after an hour: cancelled by the shop itself.
  const unpaid = await place(daysAgo(2, 20), 16, [{ p: pick(20), quantity: 1 }]);
  await startPayment({ orderId: unpaid.orderId, ...urls, now: minutes(daysAgo(2, 20), 1) }, mollie);
  mollie.setStatus(mollie.idOfOrder(unpaid.orderId), "expired");
  await expireUnpaidOrders(mollie, hours(daysAgo(2, 20), 2));
  // Cancelled by the customer within the 30 minutes: paid back by itself.
  const cancelled = await place(daysAgo(2, 13), 15, [{ p: pick(21), quantity: 1 }]);
  await pay(cancelled, minutes(daysAgo(2, 13), 2));
  await cancelByCustomer(cancelled.orderId, mollie, minutes(daysAgo(2, 13), 12));
  mollie.settleRefunds();
  await reconcile(mollie, minutes(daysAgo(2, 13), 40));
  // A different amount paid: held for the owner (D-07).
  const held = await place(daysAgo(1, 11), 17, [{ p: pick(22), quantity: 1 }]);
  mollie.overrideAmount = money(1000);
  await pay(held, minutes(daysAgo(1, 11), 2));
  mollie.overrideAmount = null;
  // BigBuy 25 % more expensive than frozen: waits for the owner (D-04).
  const pricey = pick(23);
  const blocked = await place(daysAgo(1, 15), 18, [{ p: pricey, quantity: 1 }]);
  await pay(blocked, minutes(daysAgo(1, 15), 2));
  const [cost] = await selectRows<{ c: number | string }>(pool, "SELECT supplier_cost_cents AS c FROM order_lines WHERE order_id = ? LIMIT 1", [blocked.orderId]);
  bigbuy.prices.set(pricey.sku, Math.round(Number(cost!.c) * 1.25));
  await release(minutes(daysAgo(1, 15), 40));
  bigbuy.prices.clear();
  // BigBuy refuses (not enough balance): tried again every half hour (D-04).
  const t21 = hours(NOW, -5);
  const failing = await place(t21, 19, [{ p: pick(24), quantity: 1 }]);
  await pay(failing, minutes(t21, 2));
  bigbuy.steer(failing.reference, { check: ["refuse", "refuse", "refuse", "refuse", "refuse", "refuse", "refuse", "refuse", "refuse", "refuse"] });
  await release(minutes(t21, 40));
  // Just paid: still inside the customer's 30 minutes.
  const fresh = await place(minutes(NOW, -8), 20, [{ p: pick(25), quantity: 2 }]);
  await pay(fresh, minutes(NOW, -6));

  // Review invitations for what was delivered a week ago or more.
  await runReviewInvites(NOW);

  // ---- statistics: 30 days of page views (no visitor data, D-10)
  const paths: [string, number][] = [
    ["/", 140], ["/wonen", 60], ["/tuin", 34], ["/buitenleven", 22], ["/sport", 18], ["/dieren", 20], ["/zoeken", 26],
    ["/winkelwagen", 16], ["/afrekenen", 7], ["/bestelling", 4], ["/retour", 2], ["/zo-werkt-wonzo", 9], ["/contact", 4],
    ["/beoordelingen", 6], ["/algemene-voorwaarden", 3], ["/privacy", 2], ["/en", 14], ["/en/home", 5],
    ...catalog.slice(0, 12).map((p, i): [string, number] => [`/product/${p.slug}`, 14 - i]),
  ];
  const rows: [string, string, number][] = [];
  for (let d = 29; d >= 0; d--) {
    const date = daysAgo(d, 12);
    const weekend = [0, 6].includes(date.getUTCDay()) ? 1.35 : 1;
    const growth = 0.6 + ((29 - d) / 29) * 0.6;
    paths.forEach(([path, base], i) => {
      const wobble = 0.75 + (((d * 31 + i * 17) % 11) / 10) * 0.5;
      const views = Math.max(0, Math.round(base * weekend * growth * wobble));
      if (views) rows.push([amsterdamDay(date), path, views]);
    });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await pool.query(`INSERT INTO page_views (day, path, views) VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")} ON DUPLICATE KEY UPDATE views = views + VALUES(views)`, chunk.flat());
  }

  // ---- admins (D-07): an active bookkeeper and an invited marketing colleague
  let adminsMade = 0;
  try {
    adminKey();
    const bookkeeper = `sam.jansen.demo${Date.now() % 1000}@example.com`;
    if ((await inviteAdmin(actor, { email: bookkeeper, name: "Sam Jansen", role: "boekhouder" }, daysAgo(10, 9))).ok) {
      const [a] = await selectRows<{ id: number | string }>(pool, "SELECT id FROM admins WHERE email = ?", [bookkeeper]);
      const invite = await withTransaction((conn) => issueInvite(conn, Number(a!.id), daysAgo(10, 9)));
      const secret = newTotpSecret();
      const at = daysAgo(10, 14);
      await acceptInvite({ token: invite!.token, password: randomUUID(), pending: sealPending(secret, `invite:${sha256(invite!.token)}`, at, adminKey()), code: totpCode(base32Decode(secret)!, totpStep(at)), visitor: "demo" }, at);
      adminsMade++;
    }
    const marketing = `noor.peeters.demo${Date.now() % 1000}@example.com`;
    if ((await inviteAdmin(actor, { email: marketing, name: "Noor Peeters", role: "marketing" }, hours(NOW, -3))).ok) {
      const [a] = await selectRows<{ id: number | string }>(pool, "SELECT id FROM admins WHERE email = ?", [marketing]);
      await withTransaction((conn) => issueInvite(conn, Number(a!.id), hours(NOW, -3)));
      adminsMade++;
    }
  } catch {
    // No ADMIN_TOTP_KEY in .env: no extra admins, the rest is there.
  }

  // ---- no mail goes out: what the steps queued is marked as sent; one shows a failure
  await pool.query(
    `UPDATE outbox SET status = 'SENT', sent_at = created_at, message_id = CONCAT('demo-', id) WHERE id > ? AND status = 'PENDING' AND kind IN (${MAIL_KINDS.map(() => "?").join(", ")})`,
    [Number(start), ...MAIL_KINDS],
  );
  await pool.query(
    `UPDATE outbox SET status = 'FAILED', attempts = 8, last_error = '550 5.1.1 Mailbox unavailable', message_id = NULL
      WHERE id > ? AND kind = 'order-shipped' ORDER BY id DESC LIMIT 1`,
    [Number(start)],
  );

  const [count] = await selectRows<{ n: number | string }>(pool, "SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?", [toDbTime(daysAgo(28, 0))]);
  console.log(
    [
      "",
      "Demo-data staat in de dev-database.",
      `  bestellingen in de laatste 4 weken: ${count?.n}`,
      `  vastgehouden (ander bedrag):        ${held.reference}`,
      `  inkoop te duur:                     ${blocked.reference}`,
      `  inkoop wordt geweigerd:             ${failing.reference}`,
      `  net betaald (annuleervenster):      ${fresh.reference}`,
      `  geannuleerd door de klant:          ${cancelled.reference}`,
      `  extra beheerders:                   ${adminsMade}`,
      "",
    ].join("\n"),
  );
});
