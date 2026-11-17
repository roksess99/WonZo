// The building blocks of logging in to the panel (D-07,
// .claude/rules/beveiliging.md § Authenticatie), with only node:crypto:
// passwords with scrypt, TOTP codes (RFC 6238, what every authenticator app
// speaks), the TOTP secret encrypted with ADMIN_TOTP_KEY (AES-256-GCM),
// recovery codes and random keys that are stored as a hash. No database, no
// clock of its own: every function gets the time it needs.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

if (typeof window !== "undefined") throw new Error("Admin crypto runs on the server");

// ---------------------------------------------------------------- passwords

/**
 * scrypt with N = 2^15, r = 8, p = 1 (the OWASP minimum is 2^17 with p = 1
 * at r = 8 for interactive logins on strong machines; 2^15 keeps a login on
 * shared hosting under a second — AANNAME, to measure on Hostinger). The
 * parameters are part of the stored string, so they can be raised later: a
 * login with older parameters stores a new hash (needsRehash).
 */
const SCRYPT = { log2N: 15, r: 8, p: 1, keyLength: 64 } as const;

/** Long enough for a passphrase; a cap so a megabyte "password" cannot keep the server busy. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;

function scrypt(password: string, salt: Buffer, log2N: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  const options: ScryptOptions = { N: 2 ** log2N, r, p, maxmem: 256 * 2 ** log2N * r };
  return new Promise((resolve, reject) => scryptCallback(password.normalize("NFC"), salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key))));
}

/** "scrypt$15$8$1$<salt>$<hash>", base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.log2N, SCRYPT.r, SCRYPT.p, SCRYPT.keyLength);
  return ["scrypt", SCRYPT.log2N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

const PARSE = /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{16,})\$([A-Za-z0-9_-]{32,})$/;

/** Constant time on the key itself; a stored value that is not ours is never a match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = PARSE.exec(stored);
  if (!m) return false;
  const [log2N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (log2N < 10 || log2N > 20 || r < 1 || r > 16 || p < 1 || p > 4) return false;
  const expected = Buffer.from(m[5]!, "base64url");
  const key = await scrypt(password, Buffer.from(m[4]!, "base64url"), log2N, r, p, expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function needsRehash(stored: string): boolean {
  const m = PARSE.exec(stored);
  return !m || Number(m[1]) !== SCRYPT.log2N || Number(m[2]) !== SCRYPT.r || Number(m[3]) !== SCRYPT.p;
}

/** What is wrong with a new password, or null. Length only: no rules about digits or signs (§ Authenticatie). */
export function passwordProblem(password: string, email: string): "short" | "long" | "is-email" | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return "short";
  if (length > PASSWORD_MAX) return "long";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "is-email";
  return null;
}

// ---------------------------------------------------------------- TOTP

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer | null {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  if (!/^[A-Z2-7]+$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const TOTP_PERIOD_S = 30;

/** 160 bits, the size RFC 4226 recommends, as base32 for the app. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_S);
}

/** The code of one 30-second step (RFC 6238 with HMAC-SHA1, as the apps expect). */
export function totpCode(secret: Buffer, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * The step a code belongs to: now, or one step either side (a phone clock a
 * little off). A step at or before `lastStep` was used already: refused, so
 * a code seen over someone's shoulder works no second time.
 */
export function matchTotp(secretBase32: string, code: string, now: Date, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  if (!secret) return null;
  const current = totpStep(now);
  let match: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    // Every step is computed and compared, also after a match: the same work for every code.
    const ok = timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code));
    if (ok && match === null) match = step;
  }
  if (match === null || (lastStep !== null && match <= lastStep)) return null;
  return match;
}

/** What the QR code says: the standard key-uri format, with "WonZo beheer" as the issuer. */
export function otpauthUri(secretBase32: string, account: string): string {
  const issuer = "WonZo beheer";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_S}`;
}

/** The secret in groups of four, easier to type over than 32 letters in a row. */
export function groupSecret(secretBase32: string): string {
  return secretBase32.replace(/(.{4})(?=.)/g, "$1 ");
}

// ---------------------------------------------------------------- encryption

export class AdminKeyMissing extends Error {}

/** ADMIN_TOTP_KEY: 32 random bytes as 64 hex characters (.env.example). */
export function adminKey(env: Record<string, string | undefined> = process.env): Buffer {
  const hex = (env.ADMIN_TOTP_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new AdminKeyMissing("ADMIN_TOTP_KEY must be 64 hex characters (32 random bytes).");
  return Buffer.from(hex, "hex");
}

/**
 * "v1.<iv>.<tag>.<ciphertext>", base64url. The context (e.g. "totp:7") is
 * authenticated with it: a value copied to another admin or purpose does not
 * decrypt.
 */
export function encryptText(plain: string, context: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptText(sealed: string, context: string, key: Buffer): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1]!, "base64url"));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * A secret on its way through the setup form: shown as a QR code, posted
 * back with the first code. Sealed with the server's key and a deadline, so
 * the browser carries it without being able to read or forge it, and nothing
 * half-made has to be stored.
 */
export function sealPending(secretBase32: string, context: string, now: Date, key: Buffer, validMs = 30 * 60_000): string {
  return encryptText(JSON.stringify({ s: secretBase32, exp: now.getTime() + validMs }), `pending:${context}`, key);
}

export function openPending(sealed: unknown, context: string, now: Date, key: Buffer): string | null {
  if (typeof sealed !== "string" || sealed.length > 400) return null;
  const plain = decryptText(sealed, `pending:${context}`, key);
  if (!plain) return null;
  try {
    const v = JSON.parse(plain) as { s?: unknown; exp?: unknown };
    if (typeof v.s !== "string" || typeof v.exp !== "number" || v.exp < now.getTime()) return null;
    return base32Decode(v.s) ? v.s : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- keys and recovery codes

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** 256 random bits for a cookie or a link; only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export const isToken = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);

export const RECOVERY_CODES = 10;

/** Ten codes like "k7m2q-x9p4t": 50 bits each, without letters that look alike (base32). */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODES }, () => {
    const s = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** As typed: with or without the dash, spaces, capitals. null when it cannot be a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.replace(/[\s-]/g, "").toLowerCase();
  return /^[a-z2-7]{10}$/.test(s) ? s : null;
}

export const recoveryHash = (normalized: string) => sha256(`recovery:${normalized}`);
