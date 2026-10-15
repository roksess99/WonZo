// Example orders for the mail preview (docs/MAIL.md § Voorvertoning tijdens
// het bouwen): the ordinary case and the odd ones — a long name, twenty
// lines, accents, € 0,01, and a name with markup in it, which must arrive as
// text. Fixed values: the preview looks the same every time.

import { money } from "@/lib/money";
import type { OrderMailData } from "./messages";

const at = new Date("2026-10-12T14:05:00Z");

export const EXAMPLES: { id: string; label: string; order: OrderMailData }[] = [
  {
    id: "gewoon",
    label: "Gewoon: twee artikelen",
    order: {
      locale: "nl",
      reference: "WZ-2026-00012",
      createdAt: at,
      lines: [
        { name: "Bewaardoos bamboe, set van 3", sku: "S3601234", quantity: 2, unitPrice: money(1850), lineTotal: money(3700), largeShipping: null, vatRateBp: 2100 },
        { name: "Keukenweegschaal digitaal", sku: "S7715432", quantity: 1, unitPrice: money(2495), lineTotal: money(2495), largeShipping: null, vatRateBp: 2100 },
      ],
      subtotal: money(6195),
      shippingStandard: money(0),
      shippingLarge: money(0),
      total: money(6195),
      customer: { firstName: "Sanne", lastName: "de Vries", street: "Thaliastraat", houseNumber: "12", postcode: "6846 XX", city: "Arnhem" },
      cancelWindowEndsAt: new Date(at.getTime() + 30 * 60_000),
      delivery: { minWorkingDays: 3, maxWorkingDays: 6 },
    },
  },
  {
    id: "lastig",
    label: "Lastig: twintig regels, accenten, een lange naam, markup, € 0,01",
    order: {
      locale: "nl",
      reference: "WZ-2026-00999",
      createdAt: at,
      lines: Array.from({ length: 20 }, (_, i) => ({
        name:
          i === 0
            ? "Extreem lange productnaam van een groothandel die alles in de titel stopt: kleur, maat, materiaal, aantal stuks en nog een zin erbij"
            : i === 1
              ? '<script>alert("x")</script> Crème brûlée-brander'
              : `Artikel ${i + 1} — Ærøskøbing-mok`,
        sku: `S${100000 + i}`,
        quantity: 1,
        unitPrice: money(i === 2 ? 1 : 995),
        lineTotal: money(i === 2 ? 1 : 995),
        largeShipping: i === 3 ? money(2500) : null,
        vatRateBp: 2100,
      })),
      subtotal: money(18906),
      shippingStandard: money(595),
      shippingLarge: money(2500),
      total: money(22001),
      customer: { firstName: "Zoë", lastName: "van 't Hoff-Çelik", street: "Ëerste Ölstraat", houseNumber: "1-a bis", postcode: "1234 AB", city: "'s-Hertogenbosch" },
      cancelWindowEndsAt: new Date(at.getTime() + 30 * 60_000),
      delivery: { minWorkingDays: 5, maxWorkingDays: 10 },
    },
  },
  {
    id: "engels",
    label: "Engels",
    order: {
      locale: "en",
      reference: "WZ-2026-00013",
      createdAt: at,
      lines: [{ name: "Garden lantern, solar", sku: "S5550001", quantity: 3, unitPrice: money(1299), lineTotal: money(3897), largeShipping: null, vatRateBp: 2100 }],
      subtotal: money(3897),
      shippingStandard: money(595),
      shippingLarge: money(0),
      total: money(4492),
      customer: { firstName: "Alex", lastName: "Smith", street: "Main Street", houseNumber: "5", postcode: "1011 AB", city: "Amsterdam" },
      cancelWindowEndsAt: new Date(at.getTime() + 30 * 60_000),
      delivery: { minWorkingDays: 3, maxWorkingDays: 6 },
    },
  },
];
