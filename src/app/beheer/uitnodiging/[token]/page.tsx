import { connection } from "next/server";
import { readInvite } from "@/lib/admin/auth";
import { newEnrolment } from "@/lib/admin/enrol";
import { adminMessages } from "@/lib/admin/messages";
import { getPool, hasDatabase } from "@/lib/db";
import { interpolate } from "@/lib/text";
import { NewAccountForm } from "@/components/admin/auth/NewAccountForm";

export const metadata = { title: adminMessages().invite.title };

/**
 * Accepting an invitation: the key in the link is the only proof, it works
 * for 48 hours and once (src/lib/admin/auth.ts). The page never says whether
 * a wrong key ever existed: expired, used and made-up look the same.
 */
export default async function InvitePage({ params }: PageProps<"/beheer/uitnodiging/[token]">) {
  await connection();
  const am = adminMessages();
  const m = am.invite;
  const { token } = await params;
  const invite = hasDatabase ? await readInvite(getPool(), token) : null;
  const enrolment = invite ? newEnrolment(`invite:${invite.tokenHash}`, invite.email) : null;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      {invite && enrolment ? (
        <>
          <p>{interpolate(m.intro, { name: invite.name, role: am.roles[invite.role].toLowerCase(), email: invite.email })}</p>
          <NewAccountForm mode="invite" token={token} enrolment={enrolment} m={am.credentials} submit={m.submit} doneTitle={m.doneTitle} />
        </>
      ) : (
        <p role="status" className="rounded-md border-l-4 border-warning bg-warning-soft p-4">
          {invite ? am.credentials.errors["not-configured"] : am.credentials.errors.invalid}
        </p>
      )}
    </div>
  );
}
