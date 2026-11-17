// The test banner says only what is true (src/lib/notice.ts, user 2026-11-13).

import { describe, expect, it } from "vitest";
import { getMessages } from "@/lib/i18n/messages";
import { testBanner } from "@/lib/notice";

const t = getMessages("nl").mock;

describe("the test banner", () => {
  it("example products: the full notice, whatever checking out does", () => {
    expect(testBanner("mock", false, t)).toBe("Testomgeving: voorbeeldproducten en voorbeeldprijzen. Bestellen kan nog niet.");
    expect(testBanner("mock", true, t)).toBe(t.banner);
  });

  it("real products, no checking out yet: only that", () => {
    expect(testBanner("database", false, t)).toBe("Bestellen kan nog niet: de winkel gaat binnenkort open.");
  });

  it("real products and checking out: no banner", () => {
    expect(testBanner("database", true, t)).toBeNull();
  });
});
