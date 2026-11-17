import { LogoutEverywhere, RenewCodes } from "@/components/admin/auth/AccountActions";
import { plainButton } from "@/components/admin/auth/fields";
import { requirePage } from "@/lib/admin/access";
import { readAccount } from "@/lib/admin/auth";
import { adminMessages } from "@/lib/admin/messages";
import { getPool, hasDatabase } from "@/lib/db";
import { interpolate } from "@/lib/text";
import { logoutAction } from "../inloggen/actions";

export async function generateMetadata() {
  await requirePage(null);
  return { title: adminMessages().account.title };
}

/** One's own account: who, which role, the sessions, the recovery codes. Every admin, no permission needed. */
export default async function AccountPage() {
  const admin = await requirePage(null);
  const all = adminMessages();
  const m = all.account;
  const id = Number(admin.id);
  const account = hasDatabase && Number.isSafeInteger(id) ? await readAccount(getPool(), id) : null;
  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      {!account ? (
        <p className="max-w-prose text-muted">{m.local}</p>
      ) : (
        <>
          <section aria-label={m.title} className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              <dt className="text-muted">{m.name}</dt>
              <dd>{account.name}</dd>
              <dt className="text-muted">{m.email}</dt>
              <dd className="break-all">{account.email}</dd>
              <dt className="text-muted">{m.role}</dt>
              <dd>{all.roles[account.role]}</dd>
            </dl>
          </section>
          <section aria-labelledby="sessies" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
            <h2 id="sessies" className="font-display text-h2">
              {interpolate(m.sessions, { count: account.sessions })}
            </h2>
            <p className="text-body-sm text-muted">{m.sessionsHint}</p>
            <div className="flex flex-wrap items-start gap-3">
              <form action={logoutAction}>
                <button type="submit" className={plainButton}>
                  {m.logout}
                </button>
              </form>
              <LogoutEverywhere m={m} />
            </div>
          </section>
          <section aria-labelledby="herstel" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
            <h2 id="herstel" className="font-display text-h2">
              {m.renewTitle}
            </h2>
            <p className={account.recoveryCodesLeft <= 2 ? "font-medium text-danger" : ""}>
              {interpolate(m.codesLeft, { count: account.recoveryCodesLeft })}
              {account.recoveryCodesLeft <= 2 ? ` ${m.codesLow}` : ""}
            </p>
            <RenewCodes m={m} credentials={all.credentials} />
          </section>
        </>
      )}
    </>
  );
}
