// Logging in to the panel without a database (D-07, owner 2026-10-19): the
// codes of the authenticator app against the RFC test vectors, passwords,
// the encrypted secret, recovery codes, and the rules for sessions and the
// last owner. The flows themselves run against the test database
// (tests/integration/admin-auth.test.ts).

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminKey,
  AdminKeyMissing,
  base32Decode,
  base32Encode,
  decryptText,
  encryptText,
  groupSecret,
  hashPassword,
  matchTotp,
  needsRehash,
  newRecoveryCodes,
  normalizeRecoveryCode,
  openPending,
  otpauthUri,
  passwordProblem,
  sealPending,
  totpCode,
  totpStep,
  verifyPassword,
} from "@/lib/admin/crypto";
import { parseEmail, parseName } from "@/lib/admin/auth";
import { newEnrolment } from "@/lib/admin/enrol";
import { leavesNoOwner, SESSION_IDLE_MS, SESSION_MAX_MS, sessionState } from "@/lib/admin/policy";

const KEY = Buffer.alloc(32, 7);

describe("TOTP: the codes of the authenticator app (RFC 6238)", () => {
  // RFC 6238 appendix B, SHA-1, secret "12345678901234567890"; the 6-digit code is the last 6 of the 8.
  const secret = Buffer.from("12345678901234567890");
  it("matches the test vectors of the RFC", () => {
    expect(totpCode(secret, totpStep(new Date(59_000)), 8)).toBe("94287082");
    expect(totpCode(secret, totpStep(new Date(1_111_111_109_000)), 8)).toBe("07081804");
    expect(totpCode(secret, totpStep(new Date(1_234_567_890_000)), 8)).toBe("89005924");
    expect(totpCode(secret, totpStep(new Date(2_000_000_000_000)), 8)).toBe("69279037");
    expect(totpCode(secret, totpStep(new Date(1_234_567_890_000)))).toBe("005924");
  });

  it("base32 both ways, as the apps read it", () => {
    expect(base32Encode(secret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv-gy3tqojqgezdgnbvgy3tqojq")?.equals(secret)).toBe(true);
    expect(base32Decode("not base32!")).toBeNull();
  });

  it("accepts the code of now and one step either side, not two", () => {
    const b32 = base32Encode(secret);
    const now = new Date(1_234_567_890_000);
    const step = totpStep(now);
    expect(matchTotp(b32, totpCode(secret, step), now, null)).toBe(step);
    expect(matchTotp(b32, totpCode(secret, step - 1), now, null)).toBe(step - 1);
    expect(matchTotp(b32, totpCode(secret, step + 1), now, null)).toBe(step + 1);
    expect(matchTotp(b32, totpCode(secret, step - 2), now, null)).toBeNull();
    expect(matchTotp(b32, "12345", now, null)).toBeNull();
    expect(matchTotp(b32, "abcdef", now, null)).toBeNull();
  });

  it("a code that was used works no second time, nor one of an earlier step (no replay)", () => {
    const b32 = base32Encode(secret);
    const now = new Date(1_234_567_890_000);
    const step = totpStep(now);
    expect(matchTotp(b32, totpCode(secret, step), now, step)).toBeNull();
    expect(matchTotp(b32, totpCode(secret, step - 1), now, step - 1)).toBeNull();
    expect(matchTotp(b32, totpCode(secret, step + 1), now, step)).toBe(step + 1);
  });

  it("the QR code's text: the key-uri format with the issuer, the account escaped", () => {
    expect(otpauthUri("ABCD", "sam+test@wonzo.nl")).toBe("otpauth://totp/WonZo%20beheer:sam%2Btest%40wonzo.nl?secret=ABCD&issuer=WonZo%20beheer&algorithm=SHA1&digits=6&period=30");
    expect(groupSecret("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
  });
});

describe("passwords (scrypt)", () => {
  it("the right password matches, a wrong one and a foreign hash do not", async () => {
    const stored = await hashPassword("een lange zin als wachtwoord");
    expect(stored).toMatch(/^scrypt\$15\$8\$1\$/);
    expect(await verifyPassword("een lange zin als wachtwoord", stored)).toBe(true);
    expect(await verifyPassword("een lange zin als wachtwoorD", stored)).toBe(false);
    expect(await verifyPassword("x", "$2b$10$notours")).toBe(false);
    expect(needsRehash(stored)).toBe(false);
    expect(needsRehash(stored.replace("scrypt$15$", "scrypt$14$"))).toBe(true);
  });

  it("two hashes of the same password differ (a salt each)", async () => {
    expect(await hashPassword("hetzelfde wachtwoord")).not.toBe(await hashPassword("hetzelfde wachtwoord"));
  });

  it("only length counts: 12 to 200 characters, and not the mail address", () => {
    expect(passwordProblem("kort", "a@b.nl")).toBe("short");
    expect(passwordProblem("twaalf tekns", "a@b.nl")).toBeNull();
    expect(passwordProblem("x".repeat(201), "a@b.nl")).toBe("long");
    expect(passwordProblem(" Sam@WonZo.nl ", "sam@wonzo.nl")).toBe("is-email");
  });
});

describe("the secret, encrypted with ADMIN_TOTP_KEY", () => {
  it("decrypts only with the same key and the same context", () => {
    const sealed = encryptText("GEZDGNBV", "totp:7", KEY);
    expect(decryptText(sealed, "totp:7", KEY)).toBe("GEZDGNBV");
    expect(decryptText(sealed, "totp:8", KEY)).toBeNull();
    expect(decryptText(sealed, "totp:7", Buffer.alloc(32, 8))).toBeNull();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(decryptText(parts.join("."), "totp:7", KEY)).toBeNull();
    expect(encryptText("GEZDGNBV", "totp:7", KEY)).not.toBe(sealed);
  });

  it("the key must be 64 hex characters, or logging in is off", () => {
    expect(() => adminKey({})).toThrow(AdminKeyMissing);
    expect(() => adminKey({ ADMIN_TOTP_KEY: "abc" })).toThrow(AdminKeyMissing);
    expect(adminKey({ ADMIN_TOTP_KEY: "07".repeat(32) }).equals(KEY)).toBe(true);
  });

  it("a secret on its way through the form: until its deadline, for its own page only", () => {
    const now = new Date("2026-10-19T10:00:00Z");
    const sealed = sealPending("GEZDGNBVGY3TQOJQ", "setup", now, KEY);
    expect(openPending(sealed, "setup", new Date(now.getTime() + 29 * 60_000), KEY)).toBe("GEZDGNBVGY3TQOJQ");
    expect(openPending(sealed, "setup", new Date(now.getTime() + 31 * 60_000), KEY)).toBeNull();
    expect(openPending(sealed, "invite:abc", now, KEY)).toBeNull();
    expect(openPending(123, "setup", now, KEY)).toBeNull();
  });
});

describe("recovery codes", () => {
  it("ten different codes like k7m2q-x9p4t, typed with or without dash and capitals", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    expect(normalizeRecoveryCode(" K7M2Q-X9P4T ".replace("9", "7"))).toBe("k7m2qx7p4t");
    expect(normalizeRecoveryCode("123456")).toBeNull();
  });
});

describe("sessions: 30 minutes idle, 12 hours at most (owner 2026-10-19)", () => {
  const start = new Date("2026-10-19T08:00:00Z");
  const s = (lastSeenMin: number) => ({ createdAt: start, lastSeenAt: new Date(start.getTime() + lastSeenMin * 60_000), expiresAt: new Date(start.getTime() + SESSION_MAX_MS) });
  it("valid while used, idle after 30 minutes of nothing, over after 12 hours however active", () => {
    expect(sessionState(s(0), new Date(start.getTime() + SESSION_IDLE_MS - 1))).toBe("valid");
    expect(sessionState(s(0), new Date(start.getTime() + SESSION_IDLE_MS))).toBe("idle");
    expect(sessionState(s(700), new Date(start.getTime() + 710 * 60_000))).toBe("valid");
    expect(sessionState(s(719), new Date(start.getTime() + SESSION_MAX_MS))).toBe("expired");
  });
});

describe("the last owner (D-07)", () => {
  it("cannot be disabled, reset or get another role; another owner can", () => {
    expect(leavesNoOwner([1], 1, false)).toBe(true);
    expect(leavesNoOwner([1], 1, true)).toBe(false);
    expect(leavesNoOwner([1, 2], 1, false)).toBe(false);
    // A bookkeeper or an invited owner is not one of the active owners.
    expect(leavesNoOwner([1], 3, false)).toBe(false);
  });
});

describe("input of the forms", () => {
  it("an address in small letters; a name without control characters", () => {
    expect(parseEmail("  Sam@WonZo.NL ")).toBe("sam@wonzo.nl");
    expect(parseEmail("geen adres")).toBeNull();
    expect(parseEmail(`${"a".repeat(250)}@b.nl`)).toBeNull();
    expect(parseName("  Sam   de   Vries ")).toBe("Sam de Vries");
    expect(parseName("")).toBeNull();
    expect(parseName("a\u0007b")).toBeNull();
  });
});

describe("linking the app: QR code and key to type over", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("without ADMIN_TOTP_KEY nothing is shown: a secret that cannot be stored is never handed out", () => {
    vi.stubEnv("ADMIN_TOTP_KEY", "");
    expect(newEnrolment("setup", "eigenaar")).toBeNull();
  });

  it("a QR code as SVG, a key in groups of four, and the sealed secret that belongs to both", () => {
    vi.stubEnv("ADMIN_TOTP_KEY", "07".repeat(32));
    const now = new Date("2026-10-19T10:00:00Z");
    const e = newEnrolment("setup", "eigenaar", now)!;
    expect(e.qrDataUri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(Buffer.from(e.qrDataUri.split(",")[1]!, "base64").toString()).toMatch(/^<svg[\s\S]*<\/svg>$/);
    expect(e.manualKey).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    expect(openPending(e.pending, "setup", now, KEY)).toBe(e.manualKey.replace(/ /g, ""));
    // Every visit a new secret.
    expect(newEnrolment("setup", "eigenaar", now)!.manualKey).not.toBe(e.manualKey);
  });
});
