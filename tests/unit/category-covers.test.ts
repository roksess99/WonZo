// The home page tiles with a real product photo per category (owner
// 2026-10-15): from the catalogue that is for sale, never a drawing of the
// mock passed off as a photo.

import { describe, expect, it } from "vitest";
import { categoryCovers } from "@/components/catalog/CategoryTiles";
import { getCatalog } from "@/lib/catalog/provider";

describe("a photo per category", () => {
  it("the mock catalogue has drawings only: no covers, the tiles keep their drawings", async () => {
    expect(categoryCovers(await getCatalog("nl"))).toEqual({});
  });

  it("a product with a real photo gives its category that photo; the first in the recommended order wins", async () => {
    const catalog = await getCatalog("nl");
    const first = catalog.find((p) => p.categoryKey === "tuin")!;
    const withPhoto = catalog.map((p) => (p.id === first.id ? { ...p, imageUrls: ["/_next/image-source/tuin.jpg"] } : p));
    const covers = categoryCovers(withPhoto, {});
    expect(covers).toEqual({ tuin: "/_next/image-source/tuin.jpg" });
  });

  it("the product the owner chose wins while it is for sale; gone from the catalogue, the automatic choice takes over", async () => {
    const catalog = await getCatalog("nl");
    const tuin = catalog.filter((p) => p.categoryKey === "tuin");
    const [auto, chosen] = [tuin[0]!, tuin[tuin.length - 1]!];
    const withPhotos = catalog.map((p) => (p.id === auto.id ? { ...p, imageUrls: ["/a.jpg"] } : p.id === chosen.id ? { ...p, imageUrls: ["/chosen.jpg"] } : p));
    expect(categoryCovers(withPhotos, { tuin: chosen.id }).tuin).toBe("/chosen.jpg");
    expect(categoryCovers(withPhotos.filter((p) => p.id !== chosen.id), { tuin: chosen.id }).tuin).toBe("/a.jpg");
  });
});
