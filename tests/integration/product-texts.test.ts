// The shop's own product introduction against the test database (user
// 2026-11-27): saved with both languages, a version check and an audit line;
// read back for the product page; empty means none again.

import { afterAll, describe, expect, it } from "vitest";
import { getPool, selectRows } from "@/lib/db";
import { getProductIntro, loadProductTexts, productsWithText, saveProductTexts } from "@/lib/catalog/texts";

const actor = "admin:test-texts";
const source = "test";
const productId = String(900_000_000 + (Date.now() % 1_000_000));

afterAll(async () => {
  // Leave no text behind for other files: empty is "no introduction".
  const { version } = await loadProductTexts(getPool(), source, productId);
  await saveProductTexts({ source, productId, nl: "", en: "", expectedVersion: version, actor });
  await getPool().end();
});

describe("product texts", () => {
  it("saves both languages with an audit line, and the page reads the one for its language", async () => {
    expect(await loadProductTexts(getPool(), source, productId)).toEqual({ nl: "", en: "", version: 0 });
    expect(await saveProductTexts({ source, productId, nl: " Een kast. ", en: "A cabinet.", expectedVersion: 0, actor })).toEqual({ ok: true, changed: true, version: 1 });
    expect(await getProductIntro("nl", source, productId)).toBe("Een kast.");
    expect(await getProductIntro("en", source, productId)).toBe("A cabinet.");
    expect((await productsWithText(getPool())).get(`${source}:${productId}`)).toEqual(["nl", "en"]);

    const [line] = await selectRows<{ actor: string; before_state: unknown; after_state: unknown }>(
      getPool(),
      "SELECT actor, before_state, after_state FROM audit_log WHERE action = 'product.text-changed' AND object_id = ? ORDER BY id DESC LIMIT 1",
      [`${source}:${productId}`],
    );
    expect(line?.actor).toBe(actor);
    expect(line?.before_state).toEqual({ nl: "", en: "" });
    expect(line?.after_state).toEqual({ nl: "Een kast.", en: "A cabinet." });
  });

  it("refuses a save on a version the form did not show, and too long a text, without a change", async () => {
    expect(await saveProductTexts({ source, productId, nl: "Anders.", en: "", expectedVersion: 0, actor })).toEqual({ ok: false, error: "changed" });
    expect(await saveProductTexts({ source, productId, nl: "a".repeat(601), en: "", expectedVersion: 1, actor })).toEqual({ ok: false, error: "too-long" });
    expect(await loadProductTexts(getPool(), source, productId)).toEqual({ nl: "Een kast.", en: "A cabinet.", version: 1 });
  });

  it("saving the same is no change; emptying one language leaves the other", async () => {
    expect(await saveProductTexts({ source, productId, nl: "Een kast.", en: "A cabinet.", expectedVersion: 1, actor })).toEqual({ ok: true, changed: false, version: 1 });
    expect(await saveProductTexts({ source, productId, nl: "Een kast.", en: "", expectedVersion: 1, actor })).toEqual({ ok: true, changed: true, version: 2 });
    expect(await getProductIntro("en", source, productId)).toBeNull();
    expect((await productsWithText(getPool())).get(`${source}:${productId}`)).toEqual(["nl"]);
  });
});
