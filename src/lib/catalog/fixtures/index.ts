// Deterministic mock catalog in the supplier's shape (docs/SUPPLIER_RESILIENCE.md
// § Fixtures). Shapes and quirks follow the production measurement of
// 2026-10-05 (docs/api/LEVERANCIER.md); the products themselves are invented.
// No Math.random, no Date.now. Used by the mock provider and by the tests.

import type {
  BigBuyCompliance,
  BigBuyImages,
  BigBuyInformation,
  BigBuyLowestShipping,
  BigBuyManufacturer,
  BigBuyProduct,
  BigBuyStock,
  BigBuyTaxonomy,
} from "../bigbuy/dto";

// ---------------------------------------------------------------- taxonomy

// Real production ids and names where measured; deeper levels marked * are
// invented for the mock (matching is by name, D-02).
export const taxonomies: BigBuyTaxonomy[] = [
  { id: 19656, name: "Huis en koken", parentTaxonomy: 0 },
  { id: 1310, name: "Opslag en organisatie", parentTaxonomy: 19656 },
  { id: 1317, name: "Kleding en garderobe opslag", parentTaxonomy: 1310 },
  { id: 1351, name: "Wasorganisatie en opslag", parentTaxonomy: 1310 },
  { id: 12651, name: "Meubilair", parentTaxonomy: 19656 },
  { id: 90001, name: "Lounge", parentTaxonomy: 12651 }, // *
  { id: 90002, name: "Kantoor", parentTaxonomy: 12651 }, // *
  { id: 5684, name: "Huisdecoratie", parentTaxonomy: 19656 },
  { id: 90003, name: "Kaarsen en kandelaars", parentTaxonomy: 5684 }, // *
  { id: 90004, name: "Muurdecoraties", parentTaxonomy: 5684 }, // *
  { id: 90005, name: "Seizoensgebonden decoratie", parentTaxonomy: 5684 }, // *
  { id: 5032, name: "Bestek, servies en glaswerk", parentTaxonomy: 19656 },
  { id: 90006, name: "Servies", parentTaxonomy: 5032 }, // *
  { id: 12229, name: "Keukengerei", parentTaxonomy: 19656 },
  { id: 18853, name: "Keukengerei", parentTaxonomy: 19656 }, // the measured duplicate name
  { id: 90007, name: "Bargerei", parentTaxonomy: 12229 }, // *
  { id: 90008, name: "Messen", parentTaxonomy: 18853 }, // *
  { id: 18660, name: "Woningtextiel", parentTaxonomy: 19656 },
  { id: 90009, name: "Beddengoed en kussens", parentTaxonomy: 18660 }, // *
  { id: 19661, name: "Tuin", parentTaxonomy: 0 },
  { id: 19965, name: "Tuinmeubelen en accessoires", parentTaxonomy: 19661 },
  { id: 21562, name: "Stoelen", parentTaxonomy: 19965 },
  { id: 21565, name: "Zonneschermen, tenten en luifels", parentTaxonomy: 19965 },
  { id: 21566, name: "Ligstoelen", parentTaxonomy: 19965 },
  { id: 10743, name: "Tuinieren", parentTaxonomy: 19661 },
  { id: 10896, name: "Bewatering", parentTaxonomy: 10743 },
  { id: 10750, name: "Ongediertebestrijding en gewasbescherming", parentTaxonomy: 10743 },
  { id: 2096, name: "Buitenbarbecue en dineren", parentTaxonomy: 19661 },
  { id: 2133, name: "Barbecues", parentTaxonomy: 2096 },
  { id: 2097, name: "Accessoires voor barbecues en rokerijen", parentTaxonomy: 2096 },
  { id: 19756, name: "Sport en outdoor", parentTaxonomy: 0 },
  { id: 2, name: "Kamperen en wandelen", parentTaxonomy: 19756 },
  { id: 93, name: "Kampeermeubelen", parentTaxonomy: 2 },
  { id: 50, name: "Slaapuitrusting voor kamperen ", parentTaxonomy: 2 }, // trailing space, as measured
  { id: 7948, name: "Fitness en lichaamsbeweging", parentTaxonomy: 19756 },
  { id: 7987, name: "Spieropbouw", parentTaxonomy: 7948 },
  { id: 8092, name: "Yoga", parentTaxonomy: 7948 },
  { id: 19666, name: "Dierproducten", parentTaxonomy: 0 },
  { id: 19720, name: "Honden", parentTaxonomy: 19666 },
  { id: 20309, name: "Halsbanden, tuigen en leibanden", parentTaxonomy: 19720 },
  { id: 20307, name: "Bedden en meubilair", parentTaxonomy: 19720 },
  { id: 20317, name: "Kleding en accessoires", parentTaxonomy: 19720 },
  { id: 19718, name: "Katten", parentTaxonomy: 19666 },
  { id: 20279, name: "Bedden, dekens en meubilair", parentTaxonomy: 19718 },
  { id: 19657, name: "Verlichting", parentTaxonomy: 0 },
  { id: 90010, name: "Binnenverlichting", parentTaxonomy: 19657 }, // *
];

export const manufacturers: BigBuyManufacturer[] = [
  { id: 1, name: "InnovaGoods" },
  { id: 2, name: "Home ESPRIT" },
  { id: 3, name: "Marbueno" },
  { id: 4, name: "Trixie" },
  { id: 5, name: "Julius-K9" },
  { id: 6, name: "Bestway" },
  { id: 7, name: "DKD Home Decor" },
  { id: 8, name: "Ibergarden" },
];

// ---------------------------------------------------------------- products

type Seed = {
  id: number;
  sku: string;
  taxonomy: number;
  brand: number;
  nl: string;
  en: string;
  descNl: string;
  descEn: string;
  wholesale: number | string;
  retail: number | string;
  hs: string;
  stocks: [number, number, number][]; // [quantity, minHandlingDays, maxHandlingDays]
  condition?: string;
  image?: string | null; // mock image name in /public/mock, null = none
  gpsr?: boolean;
  warnings?: string[];
  /** Lowest shipping cost to NL as BigBuy sends it; default "8.58". null = no row (excluded). */
  ship?: string | null;
  dateAdd: string;
};

const FAST_SLOW = (fast: number, slow = 0): [number, number, number][] => [
  [fast, 0, 1],
  [slow, 1, 2],
];

const seeds: Seed[] = [
  // ---- Wonen › opslag
  { id: 1300101, sku: "V0100758", taxonomy: 1317, brand: 1, nl: "Kledingorganizer voor 40 items Plusrobe InnovaGoods", en: "Plusrobe InnovaGoods 40-item clothes organiser", descNl: "Hang tot veertig kledingstukken op één roede. Opvouwbaar wanneer je hem niet gebruikt.", descEn: "Hang up to forty garments on a single rail. Folds flat when not in use.", wholesale: 7.26, retail: 21.99, hs: "39249000", stocks: FAST_SLOW(1479), image: "shelf", dateAdd: "2026-03-02 09:00:00" },
  { id: 1300102, sku: "V0103561", taxonomy: 1351, brand: 1, nl: "Inklapbaar verticaal kledingdroogrek InnovaGoods", en: "InnovaGoods foldable vertical clothes airer", descNl: "Droogrek met drie lagen.<br>Klapt plat in voor opslag.", descEn: "Three-tier airer.<br>Folds flat for storage.", wholesale: 28.87, retail: 74.99, hs: "73239300", stocks: FAST_SLOW(1431), image: "shelf", ship: "13.81", dateAdd: "2026-05-14 10:00:00" },
  { id: 1300103, sku: "V0104071", taxonomy: 1317, brand: 1, nl: "Verstelbare schoenenorganizer Sholzzer InnovaGoods", en: "Sholzzer InnovaGoods adjustable shoe organiser", descNl: "Ruimte voor tien paar schoenen. In hoogte verstelbaar.", descEn: "Room for ten pairs of shoes. Height adjustable.", wholesale: "9.84", retail: "24.99", hs: "39249000", stocks: FAST_SLOW(820), image: "shelf", dateAdd: "2025-11-20 08:00:00" },
  // ---- Wonen › meubels
  { id: 1300104, sku: "V0103950", taxonomy: 90001, brand: 1, nl: "4-in-1 slaapbank voor één persoon Softfa InnovaGoods", en: "Softfa InnovaGoods 4-in-1 single sofa bed", descNl: "Zitbank, ligstoel, bed en poef in één. <b>Hoes afneembaar</b> en wasbaar op 30 &deg;C.", descEn: "Sofa, lounger, bed and pouffe in one. <b>Removable cover</b>, washable at 30 &deg;C.", wholesale: 24.92, retail: 99.99, hs: "94016100", stocks: FAST_SLOW(846), image: "chair", ship: "63.80", dateAdd: "2026-01-10 08:00:00" },
  { id: 1300105, sku: "V0103802", taxonomy: 90002, brand: 1, nl: "Bamboe opklapbare bijzettafel Lapwood InnovaGoods", en: "Lapwood InnovaGoods foldable bamboo side table", descNl: "Bijzettafel van bamboe die je in een handomdraai inklapt.", descEn: "Bamboo side table that folds away in seconds.", wholesale: 34.11, retail: 79.99, hs: "94036090", stocks: FAST_SLOW(169), image: "table", ship: "20.27", dateAdd: "2026-06-01 08:00:00" },
  // ---- Wonen › decoratie
  { id: 1300106, sku: "S3601120", taxonomy: 90003, brand: 2, nl: "Kaarshouder Home ESPRIT Wit Hout 12 x 12 x 30 cm", en: "Home ESPRIT candle holder White Wood 12 x 12 x 30 cm", descNl: "Houten kaarshouder voor een stompkaars.", descEn: "Wooden holder for a pillar candle.", wholesale: 7.42, retail: 18.5, hs: "44209090", stocks: FAST_SLOW(7), image: "candle", gpsr: true, warnings: ["Laat een brandende kaars nooit onbeheerd achter."], dateAdd: "2025-09-15 08:00:00" },
  { id: 1300107, sku: "S3042314", taxonomy: 90004, brand: 7, nl: "Canvas DKD Home Decor Abstract 90 x 3,5 x 120 cm & lijst — „Atelier” collectie met extra lange productnaam voor de opmaak", en: "DKD Home Decor canvas Abstract 90 x 3.5 x 120 cm & frame — “Atelier” collection with an extra long product name for layout", descNl: "Canvas op houten frame.", descEn: "Canvas on a wooden frame.", wholesale: 38.18, retail: 89.0, hs: "97019100", stocks: FAST_SLOW(14), image: null, ship: "14.02", dateAdd: "2025-12-01 08:00:00" },
  { id: 1300108, sku: "S3601455", taxonomy: 90005, brand: 2, nl: "Kerstster Home ESPRIT met LED-lichten 30 cm", en: "Home ESPRIT Christmas star with LED lights 30 cm", descNl: "Decoratieve ster met lichtjes.", descEn: "Decorative star with lights.", wholesale: 6.1, retail: 15.99, hs: "95051090", stocks: FAST_SLOW(40), image: "candle", dateAdd: "2026-09-01 08:00:00" }, // excluded: electrical name
  // ---- Wonen › servies en keuken
  { id: 1300109, sku: "S2702114", taxonomy: 90006, brand: 2, nl: "Diep bord Home ESPRIT Steengoed Wit Ø 21 cm (6 Stuks)", en: "Home ESPRIT deep plate Stoneware White Ø 21 cm (6 pieces)", descNl: "Set van zes diepe borden. Vaatwasserbestendig.", descEn: "Set of six deep plates. Dishwasher safe.", wholesale: 12.4, retail: 29.95, hs: "69120025", stocks: FAST_SLOW(55), image: "mug", dateAdd: "2026-02-20 08:00:00" },
  { id: 1300110, sku: "V0104128", taxonomy: 90007, brand: 1, nl: "Set borrelschaaltjes 2-in-1 Chillour InnovaGoods", en: "Chillour InnovaGoods 2-in-1 snack bowl set", descNl: "Schaaltjes met een koelvak eronder: <i>vul het vak met ijs</i> &amp; serveer koel.", descEn: "Bowls with a chill tray below: <i>fill it with ice</i> &amp; serve cold.", wholesale: 12.35, retail: 29.99, hs: "39241000", stocks: FAST_SLOW(60), image: "mug", dateAdd: "2026-04-11 08:00:00" },
  { id: 1300111, sku: "S7910777", taxonomy: 90008, brand: 2, nl: "Koksmes Home ESPRIT RVS 20 cm", en: "Home ESPRIT chef's knife stainless steel 20 cm", descNl: "Koksmes.", descEn: "Chef's knife.", wholesale: 6.5, retail: 16.99, hs: "82119200", stocks: FAST_SLOW(30), image: "mug", dateAdd: "2026-03-03 08:00:00" }, // excluded: knife (D-36)
  { id: 1300129, sku: "S2702120", taxonomy: 90006, brand: 2, nl: "Mok Home ESPRIT Steengoed Groen 350 ml (4 Stuks)", en: "Home ESPRIT mug Stoneware Green 350 ml (4 pieces)", descNl: "Vier mokken van steengoed.", descEn: "Four stoneware mugs.", wholesale: 9.1, retail: 21.95, hs: "69120025", stocks: FAST_SLOW(40), image: "mug", ship: null, dateAdd: "2026-02-21 08:00:00" }, // excluded: no shipping cost known (D-13)
  // ---- Wonen › woningtextiel (later, D-36: category not in the assortment)
  { id: 1300112, sku: "V0103915", taxonomy: 90009, brand: 1, nl: "Elektrische deken Elakef InnovaGoods Grijs 120 x 160 cm 160 W", en: "Elakef InnovaGoods electric blanket Grey 120 x 160 cm 160 W", descNl: "Verwarmde deken.", descEn: "Heated blanket.", wholesale: 17.31, retail: 49.99, hs: "63011000", stocks: FAST_SLOW(450), image: null, dateAdd: "2026-08-01 08:00:00" }, // excluded twice: category and electrical name
  // ---- Tuin › tuinmeubels
  { id: 1300113, sku: "D1401142", taxonomy: 21565, brand: 3, nl: "Strandparasol Marbueno SUMMER Rood 160 cm", en: "Marbueno SUMMER beach umbrella Red 160 cm", descNl: "Parasol met kantelbaar dak en draagtas.", descEn: "Umbrella with tilting canopy and carry bag.", wholesale: 11.23, retail: 27.9, hs: "66019100", stocks: FAST_SLOW(1), image: "parasol", dateAdd: "2026-04-01 08:00:00" },
  { id: 1300114, sku: "V0710243", taxonomy: 21566, brand: 3, nl: "Marbueno Inklapbare stalen ligstoel met kussen", en: "Marbueno foldable steel lounger with cushion", descNl: "Ligstoel in vijf standen, met kussen.", descEn: "Five-position lounger with cushion.", wholesale: 66.12, retail: 139.0, hs: "94017900", stocks: FAST_SLOW(0, 12), image: "chair", ship: "20.27", dateAdd: "2026-03-15 08:00:00" }, // only the slow row has stock
  { id: 1300115, sku: "D1400967", taxonomy: 21562, brand: 3, nl: "Solstol Marbueno Wit/Blauw 187 x 24 x 55 cm (2 Stuks)", en: "Marbueno sun chair White/Blue 187 x 24 x 55 cm (2 pieces)", descNl: "Twee ligstoelen.", descEn: "Two sun chairs.", wholesale: 57.01, retail: 119.0, hs: "94017900", stocks: FAST_SLOW(0), image: "chair", dateAdd: "2026-02-01 08:00:00" }, // excluded: no stock (checked by the owner)
  // ---- Tuin › bewatering
  { id: 1300116, sku: "V0104010", taxonomy: 10896, brand: 1, nl: "Verlengbare tuinslang Hoxtend InnovaGoods 15 m", en: "Hoxtend InnovaGoods expandable garden hose 15 m", descNl: "Slang die uitrekt tot vijftien meter en weer krimpt.", descEn: "Hose that stretches to fifteen metres and shrinks back.", wholesale: 13.34, retail: 34.99, hs: "39173200", stocks: FAST_SLOW(56), image: "watering", dateAdd: "2026-05-02 08:00:00" },
  { id: 1300117, sku: "V0104000", taxonomy: 10750, brand: 1, nl: "Antimuggenzuiglamp KL Silen InnovaGoods", en: "KL Silen InnovaGoods mosquito suction lamp", descNl: "Insectenlamp.", descEn: "Insect lamp.", wholesale: 6.72, retail: 19.99, hs: "85437090", stocks: FAST_SLOW(90), image: null, dateAdd: "2026-05-03 08:00:00" }, // excluded: category and HS
  // ---- Tuin › barbecue
  { id: 1300118, sku: "V0104026", taxonomy: 2133, brand: 1, nl: "Mini draagbare opvouwbare houtskoolbarbecue InnovaGoods", en: "InnovaGoods mini portable folding charcoal barbecue", descNl: "Compacte barbecue voor houtskool. Past in de kofferbak.", descEn: "Compact charcoal barbecue. Fits in the boot.", wholesale: 12.35, retail: 29.99, hs: "73211900", stocks: FAST_SLOW(771), image: "bbq", warnings: ["Alleen buiten gebruiken.", "Niet gebruiken in afgesloten ruimtes."], dateAdd: "2026-04-20 08:00:00" },
  { id: 1300119, sku: "V0104070", taxonomy: 2097, brand: 1, nl: "Set oven- en barbecuemat InnovaGoods (6 stuks)", en: "InnovaGoods oven and barbecue mat set (6 pieces)", descNl: "Antiaanbakmatten voor rooster en oven.", descEn: "Non-stick mats for grill and oven.", wholesale: 11.52, retail: 24.99, hs: "39269097", stocks: FAST_SLOW(4900), image: "bbq", dateAdd: "2026-04-21 08:00:00" },
  // ---- Buitenleven › kamperen
  { id: 1300120, sku: "V0710212", taxonomy: 93, brand: 1, nl: "Inklapbare campingstoel Folstul InnovaGoods", en: "Folstul InnovaGoods folding camping chair", descNl: "Lichte stoel met bekerhouder.", descEn: "Light chair with cup holder.", wholesale: 29.71, retail: 59.99, hs: "94017900", stocks: FAST_SLOW(701), image: "chair", ship: "14.02", dateAdd: "2026-06-10 08:00:00" },
  { id: 1300121, sku: "S6105001", taxonomy: 50, brand: 6, nl: "Bestway Slaapzak Polyester Temperatuur 3 °C", en: "Bestway sleeping bag polyester temperature 3 °C", descNl: "Slaapzak voor drie seizoenen.", descEn: "Three-season sleeping bag.", wholesale: 12.63, retail: 32.99, hs: "94049000", stocks: FAST_SLOW(25), image: "mat", ship: "13.81", dateAdd: "2026-06-11 08:00:00" },
  // ---- Buitenleven › thuis sporten
  { id: 1300122, sku: "V0104096", taxonomy: 7987, brand: 1, nl: "Set draagbaar trainingssysteem met oefengids InnovaGoods", en: "InnovaGoods portable training system with exercise guide", descNl: "Weerstandsbanden, handvatten en deuranker in één set.", descEn: "Resistance bands, handles and door anchor in one set.", wholesale: 48.56, retail: 99.99, hs: "95069190", stocks: FAST_SLOW(548), image: "dumbbell", ship: "14.89", dateAdd: "2026-07-01 08:00:00" },
  { id: 1300123, sku: "V0104099", taxonomy: 8092, brand: 1, nl: "Yogamat met uitlijnlijnen Asaná InnovaGoods", en: "Asaná InnovaGoods yoga mat with alignment lines", descNl: "Antislipmat van 6 mm.", descEn: "6 mm non-slip mat.", wholesale: 9.31, retail: 24.99, hs: "95069190", stocks: FAST_SLOW(0, 30), image: "mat", condition: "REFURBISHED_B", dateAdd: "2026-07-02 08:00:00" }, // excluded: refurbished
  // ---- Dieren
  { id: 1300124, sku: "S0863702", taxonomy: 20309, brand: 5, nl: "Hondentuigje Julius-K9 IDC Zwart Maat M", en: "Julius-K9 IDC dog harness Black size M", descNl: "Stevig tuig met handvat.", descEn: "Sturdy harness with handle.", wholesale: 22.5, retail: 46.95, hs: "42010000", stocks: FAST_SLOW(18), image: "leash", dateAdd: "2026-01-05 08:00:00" },
  { id: 1300125, sku: "S0800417", taxonomy: 20279, brand: 4, nl: "Kattenhangmat Trixie Grijs 40 x 30 cm", en: "Trixie cat hammock Grey 40 x 30 cm", descNl: "Hangmat die je aan de verwarming hangt.", descEn: "Hammock that hangs on a radiator.", wholesale: 13.23, retail: 27.99, hs: "63079098", stocks: FAST_SLOW(9), image: "basket", gpsr: false, dateAdd: "2026-01-06 08:00:00" }, // excluded: no GPSR data
  { id: 1300126, sku: "S0863560", taxonomy: 20317, brand: 4, nl: "Hondenjas Trixie Pontis Grijs Maat S", en: "Trixie Pontis dog coat Grey size S", descNl: "Waterafstotende jas met reflecterende rand.", descEn: "Water-repellent coat with reflective trim.", wholesale: 14.8, retail: 32.5, hs: "62019300", stocks: FAST_SLOW(6), image: "leash", dateAdd: "2026-02-07 08:00:00" },
  { id: 1300127, sku: "S0800999", taxonomy: 20307, brand: 4, nl: "Hondenmand Trixie Vital Bed Bruin", en: "Trixie Vital dog bed Brown", descNl: "Ovale mand met afneembaar kussen.", descEn: "Oval bed with removable cushion.", wholesale: 21.4, retail: 44.99, hs: "94049000", stocks: FAST_SLOW(11), image: "basket", dateAdd: "2026-02-08 08:00:00" },
  // ---- Verlichting (not in the assortment)
  { id: 1300128, sku: "S7191227", taxonomy: 90010, brand: 2, nl: "Wandlamp Home ESPRIT Zwart 20 W", en: "Home ESPRIT wall lamp Black 20 W", descNl: "Wandlamp.", descEn: "Wall lamp.", wholesale: 41.22, retail: 89.0, hs: "94051140", stocks: FAST_SLOW(5), image: null, dateAdd: "2026-02-09 08:00:00" },
];

// ---------------------------------------------------------------- DTOs

export const products: BigBuyProduct[] = seeds.map((s) => ({
  id: s.id,
  sku: s.sku,
  ean13: `84${String(s.id).padStart(11, "0")}`,
  manufacturer: s.brand,
  taxonomy: s.taxonomy,
  wholesalePrice: s.wholesale,
  retailPrice: s.retail,
  taxRate: 21,
  condition: s.condition ?? "NEW",
  active: 1,
  intrastat: s.hs,
  dateAdd: s.dateAdd,
  weight: 1,
  height: 1,
  width: 1,
  depth: 1,
}));

export const stock: BigBuyStock[] = seeds.map((s) => ({
  id: s.id,
  sku: s.sku,
  stocks: s.stocks.map(([quantity, minHandlingDays, maxHandlingDays]) => ({ quantity, minHandlingDays, maxHandlingDays, warehouse: 1 })),
}));

export const information: Record<"nl" | "en", BigBuyInformation[]> = {
  nl: seeds.map((s) => ({ id: s.id, sku: s.sku, name: s.nl, description: s.descNl, isoCode: "nl" })),
  en: seeds.map((s) => ({ id: s.id, sku: s.sku, name: s.en, description: s.descEn, isoCode: "en" })),
};

// Shipping costs per product, in the shape of /shipping/lowest-shipping-costs-by-country/nl.
// The amounts are the measured tiers of 2026-10-05 (docs/api/LEVERANCIER.md § 10):
// € 8,58 for most small items, more for large ones.
export const lowestShipping: BigBuyLowestShipping[] = seeds
  .filter((s) => s.ship !== null)
  .map((s) => ({ reference: s.sku, cost: s.ship ?? "8.58", carrierName: "SEUR" }));

export const images: BigBuyImages[] = seeds
  .filter((s) => s.image)
  .map((s) => ({ id: s.id, images: [{ id: s.id * 10, isCover: true, url: `/mock/${s.image}.svg`, position: 0 }] }));

const manufacturerAddress: Record<number, { name: string; country: string; address: string; contact: string; webSite: string }> = {
  1: { name: "Nine New Investments S.L", country: "ES", address: "Calle de ejemplo 1, 46000 Valencia, Spanje", contact: "safety@example.com", webSite: "https://www.example.com" },
  2: { name: "DKD Home Decor S.A.", country: "ES", address: "Avenida de ejemplo 2, 28000 Madrid, Spanje", contact: "info@example.com", webSite: "https://www.example.com" },
  3: { name: "Marbueno S.L.", country: "ES", address: "Calle de ejemplo 3, 46000 Valencia, Spanje", contact: "info@example.com", webSite: "https://www.example.com" },
  4: { name: "TRIXIE Heimtierbedarf GmbH & Co KG", country: "DE", address: "Beispielstraße 4, 24000 Tarp, Duitsland", contact: "info@example.com", webSite: "https://www.example.com" },
  5: { name: "JULIUS-K9 Zrt.", country: "HU", address: "Példa utca 5, 1000 Budapest, Hongarije", contact: "info@example.com", webSite: "https://www.example.com" },
  6: { name: "Bestway Europe S.p.A.", country: "IT", address: "Via Esempio 6, 20000 Milaan, Italië", contact: "info@example.com", webSite: "https://www.example.com" },
  7: { name: "DKD Home Decor S.A.", country: "ES", address: "Avenida de ejemplo 7, 28000 Madrid, Spanje", contact: "info@example.com", webSite: "https://www.example.com" },
  8: { name: "Ibergarden S.L.", country: "ES", address: "Calle de ejemplo 8, 46000 Valencia, Spanje", contact: "info@example.com", webSite: "https://www.example.com" },
};

export const compliance: BigBuyCompliance[] = seeds
  .filter((s) => s.gpsr !== false)
  .map((s) => {
    const m = manufacturerAddress[s.brand];
    return {
      id: s.id,
      sku: s.sku,
      generalProductSafetyRegulations: [
        { name: m.name, countryIsoCode: m.country, address: m.address, contact: m.contact, webSite: m.webSite, safetyWarnings: s.warnings ?? [] },
      ],
    };
  });
