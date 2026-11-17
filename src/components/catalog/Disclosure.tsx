import { ChevronIcon } from "../icons";

/**
 * A section the visitor opens and closes, like the product information at large shops. Native <details>: works
 * without JavaScript, with the keyboard (Enter, Space) and a screen reader (announced as expandable), and the
 * text stays in the HTML — search engines read it, and the browser's find-in-page opens it. The heading sits in
 * the <summary> (allowed by the HTML spec), so heading navigation still finds the section.
 */
export function Disclosure({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-line">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 id={id} className="font-display text-h2">
          {title}
        </h2>
        {/* Points down when closed, up when open; turning only when motion is welcome. */}
        <ChevronIcon className="size-6 shrink-0 rotate-90 text-muted group-open:-rotate-90 motion-safe:transition-transform" />
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}
