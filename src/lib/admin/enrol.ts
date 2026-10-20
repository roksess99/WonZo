// What the setup and invitation pages show to link an authenticator app: a
// fresh secret, sealed for the form (src/lib/admin/crypto.ts sealPending),
// as a QR code and as text to type over. The QR code is made here, on the
// server (uqr 0.1.3, owner 2026-10-19), and never leaves the page it is shown
// on: not in a URL, not in a log.

import { renderSVG } from "uqr";
import { adminKey, groupSecret, newTotpSecret, otpauthUri, sealPending } from "./crypto";

if (typeof window !== "undefined") throw new Error("Enrolment runs on the server");

export type Enrolment = { pending: string; qrDataUri: string; manualKey: string };

/** null when ADMIN_TOTP_KEY is missing: then no secret can be stored, so none is shown. */
export function newEnrolment(context: string, account: string, now: Date = new Date()): Enrolment | null {
  let key: Buffer;
  try {
    key = adminKey();
  } catch {
    return null;
  }
  const secret = newTotpSecret();
  // Four modules of white around it: the quiet zone scanners expect.
  const svg = renderSVG(otpauthUri(secret, account), { border: 4, pixelSize: 6 });
  return { pending: sealPending(secret, context, now, key), qrDataUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, manualKey: groupSecret(secret) };
}
