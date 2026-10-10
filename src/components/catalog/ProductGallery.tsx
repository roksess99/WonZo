"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { interpolate } from "@/lib/text";
import { ChevronIcon, CloseIcon } from "../icons";
import { ProductImage } from "./ProductImage";

export type GalleryLabels = {
  /** Name of the thumbnail list; {name}. */
  list: string;
  /** Thumbnail button; {n}, {total}. */
  show: string;
  enlarge: string;
  /** Visible position in the large view; {n}, {total}. */
  position: string;
  previous: string;
  next: string;
  close: string;
  noImage: string;
};

type Props = { urls: string[]; name: string; labels: GalleryLabels };

const thumbClass = "relative size-16 shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-line";
const iconButton = "inline-flex size-11 items-center justify-center rounded-md bg-surface ring-1 ring-line";

/**
 * The photos of a product: one large, the others as buttons below it, and a
 * large view in a modal <dialog> (docs/ONDERZOEK.md § 3: at least three
 * photos, large to view). Nothing moves by itself (D-35). The dialog follows
 * docs/ACCESSIBILITY.md § Dialogen: a name, focus inside and trapped (native
 * modal), Escape closes, focus back to the button that opened it.
 * Only the first photo loads with the page; the others when they are needed.
 */
export function ProductGallery({ urls, name, labels }: Props) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const total = urls.length;
  const current = urls[index];
  const position = interpolate(labels.position, { n: index + 1, total });
  const go = (step: number) => setIndex((i) => (i + step + total) % total);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  if (!current) return <ProductImage src={undefined} alt={name} noImageText={labels.noImage} sizes="(min-width: 768px) 50vw, 100vw" />;

  return (
    <div className="flex flex-col gap-3">
      <button ref={openerRef} type="button" onClick={() => setOpen(true)} aria-label={`${labels.enlarge}: ${name}`} className="cursor-zoom-in rounded-md">
        <ProductImage src={current} alt={name} noImageText={labels.noImage} priority={index === 0} sizes="(min-width: 768px) 50vw, 100vw" />
      </button>

      {total > 1 ? (
        <ul aria-label={interpolate(labels.list, { name })} className="flex flex-wrap gap-2">
          {urls.map((url, i) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={interpolate(labels.show, { n: i + 1, total })}
                aria-current={i === index ? "true" : undefined}
                className={`${thumbClass} ${i === index ? "ring-2 ring-foreground" : ""}`}
              >
                <Image src={url} alt="" fill sizes="64px" className="object-contain p-1" unoptimized={url.endsWith(".svg")} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <dialog
          ref={dialogRef}
          aria-label={name}
          onClose={() => {
            setOpen(false);
            openerRef.current?.focus();
          }}
          // A click on the backdrop lands on the <dialog> itself: close.
          onClick={(e) => {
            if (e.target === e.currentTarget) e.currentTarget.close();
          }}
          onKeyDown={(e) => {
            if (total > 1 && e.key === "ArrowLeft") go(-1);
            if (total > 1 && e.key === "ArrowRight") go(1);
          }}
          // The scrim is the one fixed colour here (.claude/rules/frontend.md § Kleur):
          // it dims the page behind the photo, whatever the theme.
          className="m-auto max-h-none max-w-none rounded-md bg-surface p-4 text-foreground backdrop:bg-black/70"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-body-sm tabular-nums" aria-live="polite">
                {position}
              </p>
              <button type="button" onClick={() => dialogRef.current?.close()} className={iconButton} autoFocus>
                <CloseIcon />
                <span className="sr-only">{labels.close}</span>
              </button>
            </div>
            {/* The square fits the width and the height of the screen. */}
            <div className="relative aspect-square w-[min(56rem,calc(100vw-4rem),calc(100svh-10rem))]">
              <Image src={current} alt={name} fill sizes="(min-width: 960px) 56rem, 100vw" className="object-contain" unoptimized={current.endsWith(".svg")} />
            </div>
            {total > 1 ? (
              <div className="flex justify-center gap-4">
                <button type="button" onClick={() => go(-1)} className={iconButton}>
                  <ChevronIcon className="size-5 rotate-180" />
                  <span className="sr-only">{labels.previous}</span>
                </button>
                <button type="button" onClick={() => go(1)} className={iconButton}>
                  <ChevronIcon />
                  <span className="sr-only">{labels.next}</span>
                </button>
              </div>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
