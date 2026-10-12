// A stand-in for ordering at BigBuy (docs/TESTEN.md: never a real supplier
// in tests, its contract instead), as doc.json describes it: a check returns
// what the order would cost, a create places it under our own reference, and
// the reference finds it again. Unless a test says otherwise the supplier
// charges what was frozen (read from the test database). Tests steer it.

import { selectRows, getPool } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import type { CheckAnswer, LookupAnswer, PlaceAnswer, SupplierOrdering, SupplierOrderRequest } from "@/lib/catalog/ordering";

type Next<T> = (T | "refuse" | "lost-after-create" | "lost-before-create" | "unknown")[];

export class FakeBigBuy implements SupplierOrdering {
  readonly source = "bigbuy" as const;
  readonly mode = "sandbox" as const;
  /** Orders that exist at the supplier, by our reference. */
  placed = new Map<string, { id: string; request: SupplierOrderRequest }>();
  calls: { op: "check" | "place" | "lookup"; reference: string }[] = [];
  /**
   * What the next calls for one reference do, in order; nothing: the normal
   * answer. Per reference, because one run of the job also handles what
   * other tests left in the test database.
   */
  private steering = new Map<string, { check: Next<"ok">; place: Next<"ok">; lookup: Next<"ok"> }>();
  /** The supplier's price per piece, in cents, for a SKU; otherwise the frozen one. */
  prices = new Map<string, number>();
  private seq = 1000;

  steer(reference: string, s: Partial<{ check: Next<"ok">; place: Next<"ok">; lookup: Next<"ok"> }>) {
    const cur = this.steering.get(reference) ?? { check: [], place: [], lookup: [] };
    this.steering.set(reference, { check: [...cur.check, ...(s.check ?? [])], place: [...cur.place, ...(s.place ?? [])], lookup: [...cur.lookup, ...(s.lookup ?? [])] });
  }
  private next(reference: string, op: "check" | "place" | "lookup") {
    return this.steering.get(reference)?.[op].shift();
  }

  private async productsCost(req: SupplierOrderRequest): Promise<Money> {
    let total = 0;
    for (const l of req.lines) {
      const own = this.prices.get(l.sku);
      const frozen = own ?? Number((await selectRows<{ c: number | string }>(getPool(), "SELECT supplier_cost_cents AS c FROM order_lines WHERE sku = ? ORDER BY order_id DESC LIMIT 1", [l.sku]))[0]?.c ?? 0);
      total += frozen * l.quantity;
    }
    return money(total);
  }

  async check(req: SupplierOrderRequest): Promise<CheckAnswer> {
    this.calls.push({ op: "check", reference: req.reference });
    const how = this.next(req.reference, "check");
    if (how === "refuse") return { kind: "refused", status: 400, message: "not enough balance" };
    if (how === "unknown") return { kind: "unknown" };
    const products = await this.productsCost(req);
    return { kind: "ok", products, total: money(products.amount + 858) };
  }

  async place(req: SupplierOrderRequest): Promise<PlaceAnswer> {
    this.calls.push({ op: "place", reference: req.reference });
    const how = this.next(req.reference, "place");
    if (how === "refuse") return { kind: "refused", status: 400, message: "not enough balance" };
    if (how === "lost-before-create") return { kind: "unknown" };
    // A second order under a reference that is there already: refused as a conflict, which reads as unknown (doc.json: 409).
    if (this.placed.has(req.reference)) return { kind: "unknown" };
    const id = String(this.seq++);
    this.placed.set(req.reference, { id, request: req });
    if (how === "lost-after-create") return { kind: "unknown" };
    return { kind: "placed", supplierOrderRef: id };
  }

  async lookup(reference: string): Promise<LookupAnswer> {
    this.calls.push({ op: "lookup", reference });
    if (this.next(reference, "lookup") === "unknown") return { kind: "unknown" };
    const found = this.placed.get(reference);
    return found ? { kind: "found", supplierOrderRef: found.id } : { kind: "absent" };
  }

  callsFor(reference: string, op: "check" | "place" | "lookup") {
    return this.calls.filter((c) => c.reference === reference && c.op === op).length;
  }
}
