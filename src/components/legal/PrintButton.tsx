"use client";

/** The terms must be printable or savable (`WETTELIJK`, BW 6:234): the browser's own print, which also saves as PDF. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 self-start rounded-md bg-surface px-4 font-medium ring-1 ring-border print:hidden">
      {label}
    </button>
  );
}
