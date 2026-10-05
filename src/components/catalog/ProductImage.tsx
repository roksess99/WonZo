import Image from "next/image";

type Props = { src: string | undefined; alt: string; noImageText: string; priority?: boolean; sizes: string };

/**
 * Product photos sit on a fixed white square with object-fit: contain, so the
 * page does not jump per photo (docs/BRAND.md § Beeld). No photo: our own
 * muted placeholder with the mark, never a broken image.
 */
export function ProductImage({ src, alt, noImageText, priority, sizes }: Props) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-surface">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          // SVG mock images are not run through the optimiser.
          unoptimized={src.endsWith(".svg")}
          className="object-contain p-4"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
          <Image src="/brand/wonzo-mark.svg" alt="" width={48} height={48} className="opacity-30 grayscale" unoptimized />
          <span className="text-body-sm">{noImageText}</span>
        </div>
      )}
    </div>
  );
}
