import Link from "next/link";
import { AlertIcon, InfoIcon } from "./icons";

/** An empty or error state is an invitation with a way forward (docs/SCHERMEN.md). */
export function StateMessage({
  title,
  text,
  tone = "info",
  action,
  children,
}: {
  title: string;
  text: string;
  tone?: "info" | "warning";
  action?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  const Icon = tone === "warning" ? AlertIcon : InfoIcon;
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={`flex flex-col gap-3 rounded-md border-l-4 p-6 ${
        tone === "warning" ? "border-warning bg-warning-soft" : "border-petrol bg-surface ring-1 ring-line"
      }`}
    >
      <h2 className={`flex items-center gap-2 text-h2 font-display ${tone === "warning" ? "text-warning" : ""}`}>
        <Icon className="size-6 shrink-0" />
        {title}
      </h2>
      <p className="max-w-prose">{text}</p>
      {action ? (
        <p>
          <Link href={action.href} className="font-medium underline decoration-2 underline-offset-4">
            {action.label}
          </Link>
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function Breadcrumb({ items, label }: { items: { href?: string; label: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="text-body-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Max content width, used everywhere (.claude/rules/frontend.md § Layout). */
export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}
