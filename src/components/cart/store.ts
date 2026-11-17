"use client";

// The cart in this browser. localStorage is strictly necessary for the service
// the visitor asks for, so it needs no consent (docs/PRIVACY.md § Op het
// apparaat). It holds references only (src/lib/cart/cart.ts). Storage can be
// missing or throw (private window, blocked site data): the cart then lives
// in memory for this page and the shop keeps working.

import { useSyncExternalStore } from "react";
import { addLine, readStoredCart, removeLine, setQuantity, storedForm, type AddResult, type CartLine } from "@/lib/cart/cart";

const KEY = "wonzo.cart.v1";
const EVENT = "wonzo:cart";

let cache: CartLine[] | null = null;

function load(): CartLine[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? readStoredCart(JSON.parse(raw)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(lines: CartLine[]) {
  cache = lines;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(storedForm(lines)));
  } catch {
    // Not stored; still correct for this page.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  // Another tab changed the cart: read it again, so both tabs agree.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

/** The cart lines; null on the server and before hydration (unknown, not empty). */
export function useCart(): CartLine[] | null {
  return useSyncExternalStore(subscribe, load, () => null);
}

export const cartActions = {
  add(line: CartLine, stock: number): AddResult {
    const result = addLine(load(), line, stock);
    if (result.added) save(result.lines);
    return result;
  },
  setQuantity(ref: Pick<CartLine, "source" | "productId">, quantity: number) {
    save(setQuantity(load(), ref, quantity));
  },
  remove(ref: Pick<CartLine, "source" | "productId">) {
    save(removeLine(load(), ref));
  },
  /** After a paid order: the cart has done its work, and so has its code. */
  clear() {
    if (load().length) save([]);
    if (loadCode()) saveCode("");
  },
};

// The discount code the visitor typed (docs/SCHERMEN.md: the code can go in
// the cart already), kept next to the cart so the checkout sends it along.
// Only the text: whether it applies, and for how much, the server says on
// every quote.
const CODE_KEY = "wonzo.code.v1";
const CODE_EVENT = "wonzo:code";
let codeCache: string | null | undefined;

function loadCode(): string {
  if (codeCache !== undefined) return codeCache ?? "";
  try {
    const raw = window.localStorage.getItem(CODE_KEY);
    codeCache = typeof raw === "string" && raw.length <= 64 ? raw : null;
  } catch {
    codeCache = null;
  }
  return codeCache ?? "";
}

function saveCode(text: string) {
  codeCache = text || null;
  try {
    if (text) window.localStorage.setItem(CODE_KEY, text);
    else window.localStorage.removeItem(CODE_KEY);
  } catch {
    // Not stored; still correct for this page.
  }
  window.dispatchEvent(new Event(CODE_EVENT));
}

function subscribeCode(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === CODE_KEY || e.key === null) {
      codeCache = undefined;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CODE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CODE_EVENT, onChange);
  };
}

/** The code text, "" for none; null on the server and before hydration. */
export function useCode(): string | null {
  return useSyncExternalStore(subscribeCode, loadCode, () => null);
}

export const codeActions = {
  set(text: string) {
    saveCode(text.trim().toUpperCase().slice(0, 64));
  },
  clear() {
    saveCode("");
  },
};
