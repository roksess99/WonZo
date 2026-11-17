import { dateTime } from "@/components/admin/format";
import { AdminRowActions } from "@/components/admin/auth/AdminRowActions";
import { InviteAdminForm } from "@/components/admin/auth/InviteAdminForm";
import { requirePage } from "@/lib/admin/access";
import { listAdmins } from "@/lib/admin/auth";
import { adminMessages } from "@/lib/admin/messages";
import { getPool, hasDatabase } from "@/lib/db";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("beheerders");
  return { title: adminMessages().admins.title };
}

/**
 * Who may use the panel (D-07, docs/BEHEER.md § Beheerders): three fixed
 * roles, invitations, and the changes an owner makes to another admin.
 * Permission "beheerders": only the owner's role.
 */
export default async function AdminsPage() {
  const admin = await requirePage("beheerders");
  const all = adminMessages();
  const m = all.admins;
  const rows = hasDatabase
    ? await listAdmins(getPool()).catch((err: unknown) => {
        console.error("[beheer/beheerders]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
        return null;
      })
    : [];
  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
      {rows === null ? (
        <p role="alert" className="font-medium text-danger">
          {all.dashboard.loadError}
        </p>
      ) : (
        <section aria-label={m.title} className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
          <ul className="flex flex-col">
            {rows.map((r) => {
              const self = admin.actor === `admin:${r.id}`;
              return (
                <li key={r.id} className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">
                      {r.name} {self ? <span className="text-muted">{m.you}</span> : null}
                    </p>
                    <p className="break-all text-body-sm">{r.email}</p>
                    <p className="text-body-sm">
                      <span className="rounded-sm bg-background px-2 py-0.5 ring-1 ring-line">{m.status[r.status]}</span> · {all.roles[r.role]}
                    </p>
                    <p className="text-body-sm text-muted tabular-nums">
                      {m.colLastSeen}: {r.lastSeenAt ? dateTime(r.lastSeenAt) : m.never}
                      {r.status === "invited" ? ` · ${r.inviteExpiresAt ? interpolate(m.inviteValidUntil, { date: dateTime(r.inviteExpiresAt) }) : m.inviteWaiting}` : ""}
                    </p>
                  </div>
                  {self ? null : <AdminRowActions admin={{ id: r.id, name: r.name, role: r.role, status: r.status }} m={m} roles={all.roles} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section aria-labelledby="uitnodigen" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="uitnodigen" className="font-display text-h2">
          {m.inviteTitle}
        </h2>
        <p className="max-w-prose">{m.inviteText}</p>
        <InviteAdminForm m={m} roles={all.roles} hints={all.roleHints} />
      </section>
    </>
  );
}
