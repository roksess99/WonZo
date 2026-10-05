"use client";

import Link from "next/link";
import { useState } from "react";
import { MAX_LINES, MAX_QUANTITY } from "@/lib/cart/cart";
import { interpolate } from "@/lib/text";
import { CheckIcon } from "../icons";
import { QuantityStepper, type StepperLabels } from "./QuantityStepper";
import { cartActions } from "./store";

export type AddToCartLabels = StepperLabels & { button: string; added: string; viewCart: string; tooMany: string; cartFull: string };

type Props = { productId: string; stock: number; cartHref: string; labels: AddToCartLabels };

type Status = { kind: "idle" } | { kind: "added" } | { kind: "refused"; inCart: number; reason: "stock" | "full" };

/**
 * The one primary action on the product page (docs/BRAND.md: accent, white
 * text). Success is announced in a status region without moving focus and
 * without a pop-up to close (docs/ACCESSIBILITY.md).
 */
export function AddToCart({ productId, stock, cartHref, labels }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function add() {
    const result = cartActions.add({ source: "bigbuy", productId, quantity }, stock);
    setStatus(result.added ? { kind: "added" } : { kind: "refused", inCart: result.inCart, reason: result.reason });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <QuantityStepper
          id={`qty-${productId}`}
          value={quantity}
          max={Math.min(stock, MAX_QUANTITY)}
          onChange={(n) => {
            setQuantity(n);
            setStatus({ kind: "idle" });
          }}
          labels={labels}
          showLabel
        />
        <button
          type="button"
          onClick={add}
          className="min-h-12 flex-1 rounded-md bg-accent px-6 text-body font-bold text-accent-contrast hover:brightness-95"
        >
          {labels.button}
        </button>
      </div>
      <div role="status" className="text-body-sm">
        {status.kind === "added" ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-success-soft p-3 text-success">
            <CheckIcon className="size-4 shrink-0" />
            <span>{labels.added}</span>
            <Link href={cartHref} className="inline-flex min-h-11 items-center font-medium text-foreground underline decoration-2 underline-offset-4">
              {labels.viewCart}
            </Link>
          </p>
        ) : null}
        {status.kind === "refused" ? (
          <p className="rounded-md bg-warning-soft p-3 text-warning">
            {status.reason === "full" ? interpolate(labels.cartFull, { max: MAX_LINES }) : interpolate(labels.tooMany, { inCart: status.inCart, stock })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
