"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminMessages } from "@/lib/admin/messages";
import { plainButton, primaryButton } from "./fields";

/** The recovery codes, once (.claude/rules/beveiliging.md § Authenticatie, herstelcodes): to copy or print, then on to the panel. */
export function RecoveryCodes({ codes, m, href, next }: { codes: string[]; m: AdminMessages["credentials"]; href: string; next: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="herstelcodes" className="flex flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
      <h2 id="herstelcodes" className="font-display text-h2 font-bold">
        {m.codesTitle}
      </h2>
      <p>{m.codesText}</p>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-body tabular-nums sm:grid-cols-2">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={plainButton}
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n")).then(() => setCopied(true));
          }}
        >
          {m.codesCopy}
        </button>
        <p role="status" className="text-body-sm text-success">
          {copied ? m.codesCopied : ""}
        </p>
      </div>
      <div>
        <Link href={href} className={`${primaryButton} inline-flex items-center`}>
          {next}
        </Link>
      </div>
    </section>
  );
}
