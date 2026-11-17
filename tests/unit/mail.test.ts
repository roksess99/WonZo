// The mail without a server: the settings, who gets a mail where, what an
// SMTP error means, and what the messages say (docs/MAIL.md). The outbox
// worker runs against the test database (tests/integration/mail.test.ts).

import { describe, expect, it } from "vitest";
import { adminMessages } from "@/lib/admin/messages";
import { getMessages } from "@/lib/i18n/messages";
import { bareAddress, parseMailConfig, recipient } from "@/lib/mail/config";
import { EXAMPLES } from "@/lib/mail/examples";
import { adminAlert, adminNewOrder, alertKind, orderCancelled, orderConfirmation } from "@/lib/mail/messages";
import { escapeHtml } from "@/lib/mail/style";
import { classify } from "@/lib/mail/transport";
import { backoffMs, MAX_ATTEMPTS } from "@/lib/mail/worker";
import { formatMoney, money } from "@/lib/money";

const base = { SMTP_HOST: "smtp.hostinger.com", SMTP_PORT: "465", SMTP_USER: "info@wonzo.nl", SMTP_PASSWORD: "x", MAIL_FROM: "WonZo <info@wonzo.nl>", MAIL_ORDERS_TO: "eigenaar@example.nl" };

describe("settings (D-29)", () => {
  it("no SMTP_HOST: no mail, nothing breaks", () => {
    expect(parseMailConfig({})).toBeNull();
  });
  it("port 465 is TLS from the start; 587 is STARTTLS", () => {
    expect(parseMailConfig(base)).toMatchObject({ port: 465, secure: true });
    expect(parseMailConfig({ ...base, SMTP_PORT: "587" })).toMatchObject({ port: 587, secure: false });
  });
  it("the sender is an address on the shop's own domain", () => {
    expect(() => parseMailConfig({ ...base, MAIL_FROM: "WonZo <wonzo@gmail.com>" })).toThrow(/on wonzo\.nl/);
    expect(() => parseMailConfig({ ...base, MAIL_FROM: "" })).toThrow(/MAIL_FROM/);
  });
  it("needs somewhere for the order notifications to go, and a login", () => {
    expect(() => parseMailConfig({ ...base, MAIL_ORDERS_TO: "" })).toThrow(/MAIL_ORDERS_TO/);
    expect(() => parseMailConfig({ ...base, SMTP_PASSWORD: "" })).toThrow(/SMTP_PASSWORD/);
  });
  it("reads the bare address of a display name", () => {
    expect(bareAddress("WonZo <info@wonzo.nl>")).toBe("info@wonzo.nl");
    expect(bareAddress("info@wonzo.nl")).toBe("info@wonzo.nl");
    expect(bareAddress("WonZo")).toBeNull();
  });
});

describe("who gets it (docs/MAIL.md § Tijdens het ontwikkelen)", () => {
  it("in production the customer; elsewhere only the test address — or nobody", () => {
    expect(recipient({ ...parseMailConfig({ ...base, NODE_ENV: "production" })! }, "klant@example.nl")).toBe("klant@example.nl");
    expect(recipient(parseMailConfig({ ...base, NODE_ENV: "development", MAIL_REDIRECT_TO: "test@wonzo.nl" })!, "klant@example.nl")).toBe("test@wonzo.nl");
    expect(recipient(parseMailConfig({ ...base, NODE_ENV: "development" })!, "klant@example.nl")).toBeNull();
  });
});

describe("what an SMTP error means", () => {
  it("a 5xx refusal of this message is final; a login failure or a 4xx is tried again", () => {
    expect(classify({ code: "EENVELOPE", responseCode: 550 })).toEqual({ kind: "refused", error: "EENVELOPE 550" });
    expect(classify({ code: "EAUTH", responseCode: 535 })).toEqual({ kind: "failed", error: "EAUTH 535" });
    expect(classify({ code: "ECONNECTION" })).toEqual({ kind: "failed", error: "ECONNECTION" });
    expect(classify({ responseCode: 451 }).kind).toBe("failed");
  });
  it("waits longer each time, and stops after a fixed number of tries", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(5 * 60_000);
    expect(backoffMs(MAX_ATTEMPTS - 1)).toBe(12 * 3_600_000);
  });
});

describe("the messages", () => {
  const links = { statusUrl: "https://wonzo.nl/bestelling/abc", contactUrl: "https://wonzo.nl/contact", logoUrl: "https://wonzo.nl/brand/png/x.png", email: "info@wonzo.nl", returnUrl: "https://wonzo.nl/retour", withdrawalFormUrl: "https://wonzo.nl/herroepingsformulier" };
  const [plain, odd, english] = EXAMPLES;

  it("the confirmation carries what the law asks, in HTML and in text (BW 6:230v)", () => {
    const mail = orderConfirmation(plain!.order, links, getMessages("nl"));
    expect(mail.subject).toBe("Bestelling WZ-2026-00012 ontvangen");
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("2 × Bewaardoos bamboe, set van 3");
      expect(part).toContain(formatMoney(money(1850)));
      expect(part).toContain(formatMoney(money(6195)));
      expect(part).toContain("inclusief btw");
      expect(part).toContain("14 dagen");
      expect(part).toContain("KvK 42126738");
      expect(part).toContain("NL005516835B45");
      expect(part).toContain("https://wonzo.nl/bestelling/abc");
      expect(part).toContain("Thaliastraat 12");
    }
  });

  it("every value is escaped: a name with markup arrives as text", () => {
    const mail = orderConfirmation(odd!.order, links, getMessages("nl"));
    expect(mail.html).not.toContain('<script>alert("x")</script>');
    expect(mail.html).toContain(escapeHtml('<script>alert("x")</script>'));
    expect(mail.html).toContain(escapeHtml("van 't Hoff-Çelik"));
    expect(mail.html).toContain(formatMoney(money(1)));
    expect(mail.html).not.toContain("nowrap");
  });

  it("in the customer's language", () => {
    const mail = orderConfirmation(english!.order, links, getMessages("en"));
    expect(mail.subject).toBe("Order WZ-2026-00013 received");
    expect(mail.text).toContain("Cooling-off period: 14 days");
  });

  it("cancelled: the amount paid back", () => {
    const mail = orderCancelled({ locale: "nl", reference: "WZ-2026-00012", refund: money(6195) }, links, getMessages("nl"));
    expect(mail.subject).toBe("Bestelling WZ-2026-00012 geannuleerd");
    expect(mail.text).toContain(`${formatMoney(money(6195))} terug`);
    expect(mail.text).not.toContain("leverancier");
  });

  it("cancelled because BigBuy would not take it (D-04): says we could not deliver, and the amount", () => {
    const nl = orderCancelled({ locale: "nl", reference: "WZ-2026-00012", refund: money(6195), why: "undeliverable" }, links, getMessages("nl"));
    expect(nl.subject).toBe("Bestelling WZ-2026-00012 geannuleerd: we konden niet leveren");
    expect(nl.text).toContain("We konden je bestelling niet leveren");
    expect(nl.text).toContain("niet bij onze leverancier bestellen");
    expect(nl.text).toContain(`${formatMoney(money(6195))} terug`);
    expect(nl.html).toContain("We konden je bestelling niet leveren");
    const en = orderCancelled({ locale: "en", reference: "WZ-2026-00012", refund: money(6195), why: "undeliverable" }, links, getMessages("en"));
    expect(en.subject).toBe("Order WZ-2026-00012 cancelled: we could not deliver");
    expect(en.text).toContain(`${formatMoney(money(6195))} back`);
  });

  it("for the owner: the number and amount in the subject, the supplier's numbers, a link to the panel", () => {
    const mail = adminNewOrder(plain!.order, "https://wonzo.nl/beheer/bestellingen/1", links.logoUrl, adminMessages());
    expect(mail.subject).toBe(`Nieuwe bestelling WZ-2026-00012 — ${formatMoney(money(6195))}`);
    expect(mail.text).toContain("2 × S3601234");
    expect(mail.text).toContain("https://wonzo.nl/beheer/bestellingen/1");
  });

  it("an alert says what it is about, read from its key", () => {
    expect(alertKind("order:12:hold:AMOUNT_MISMATCH")).toBe("hold");
    expect(alertKind("supplier:abc:failed")).toBe("supplierFailed");
    expect(alertKind("supplier:abc:gave-up")).toBe("supplierGaveUp");
    expect(alertKind("supplier:abc:refunded")).toBe("supplierRefunded");
    expect(alertKind("supplier:abc:price:1234")).toBe("supplierPrice");
    expect(alertKind("refund:abc:failed")).toBe("refundFailed");
    expect(alertKind("payment:abc:EXPIRED->PAID")).toBe("payment");
    expect(alertKind("iets-anders")).toBe("other");
    const mail = adminAlert({ reference: "WZ-2026-00012", kind: "supplierFailed", detail: { error: "Insufficient balance" }, paid: true }, "https://wonzo.nl/beheer/bestellingen/1", links.logoUrl, adminMessages());
    expect(mail.subject).toBe("Let op: WZ-2026-00012 — inkoop bij BigBuy lukt niet (Insufficient balance)");
    expect(mail.text).toContain("De klant heeft betaald.");
    // What to do, and what happens if nobody does (D-04, user 2026-11-13).
    expect(mail.text).toContain("Waardeer het tegoed in je BigBuy-account op.");
    expect(mail.text).toContain("vanzelf geannuleerd");
    const done = adminAlert({ reference: "WZ-2026-00012", kind: "supplierRefunded", detail: {}, paid: true }, "https://wonzo.nl/beheer/bestellingen/1", links.logoUrl, adminMessages());
    expect(done.subject).toBe("Let op: WZ-2026-00012 — inkoop bij BigBuy lukte 24 uur niet; de bestelling is geannuleerd en terugbetaald");
    expect(done.text).toContain("Je hoeft niets te doen");
    // An alert without a next step gets no extra line.
    expect(adminAlert({ reference: "WZ-2026-00012", kind: "other", detail: {}, paid: false }, "https://wonzo.nl/beheer/bestellingen/1", links.logoUrl, adminMessages()).text).not.toContain("Waardeer");
  });
});
