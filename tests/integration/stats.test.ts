// The shop's own statistics against the test database (D-10, owner
// 2026-10-15): a view counted per page per day, and read back for the panel.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, selectRows } from "@/lib/db";
import { amsterdamDay, countedPath, readStats, recordView } from "@/lib/stats";

afterAll(async () => {
  await getPool().end();
});

describe("page views per page per day", () => {
  it("two views of one page are one row with 2; the panel sees them, and nothing else is stored", async () => {
    const now = new Date();
    const path = countedPath(`/test-${randomUUID().slice(0, 8)}`)!;
    await recordView(path, now);
    await recordView(path, now);
    const rows = await selectRows<Record<string, unknown>>(getPool(), "SELECT * FROM page_views WHERE path = ?", [path]);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(["day", "path", "views"]);
    expect(Number(rows[0]!.views)).toBe(2);
    const stats = await readStats(getPool(), 7, now, 10_000);
    expect(stats.pages.find((p) => p.path === path)?.views).toBe(2);
    expect(stats.days).toHaveLength(7);
    expect(stats.days.at(-1)!.day).toBe(amsterdamDay(now));
  });
});
