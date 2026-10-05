"use client";

import { usePathname } from "next/navigation";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

/** Unexpected errors: say what happened and offer one way forward. Expected supplier failures never get here. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname() ?? "/";
  const m = pathname === "/en" || pathname.startsWith("/en/") ? en : nl;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-16 sm:px-6">
      <h1 className="font-display text-h1 font-bold">{m.error.title}</h1>
      <p>{m.error.text}</p>
      <p>
        <button type="button" onClick={reset} className="min-h-11 rounded-md bg-petrol px-4 font-medium text-on-petrol">
          {m.error.retry}
        </button>
      </p>
    </div>
  );
}
