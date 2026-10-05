"use client";

import Link from "next/link";
import { itemCount } from "@/lib/cart/cart";
import { interpolate } from "@/lib/text";
import { CartIcon } from "../icons";
import { useCart } from "./store";

/** Header link with the number of items; icon always with its word (docs/ONDERZOEK.md § 4). */
export function CartLink({ href, label, countLabel }: { href: string; label: string; countLabel: string }) {
  const lines = useCart();
  const count = lines ? itemCount(lines) : 0;
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 hover:bg-background">
      <CartIcon />
      <span>{label}</span>
      {count > 0 ? (
        <span className="inline-flex min-w-6 items-center justify-center rounded-pill bg-petrol px-1.5 text-body-sm font-bold text-on-petrol tabular-nums">
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{interpolate(countLabel, { count })}</span>
        </span>
      ) : null}
    </Link>
  );
}
