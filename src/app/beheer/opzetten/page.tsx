import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setupOpen, setupToken } from "@/lib/admin/auth";
import { newEnrolment } from "@/lib/admin/enrol";
import { adminMessages } from "@/lib/admin/messages";
import { hasDatabase } from "@/lib/db";
import { NewAccountForm } from "@/components/admin/auth/NewAccountForm";

export const metadata = { title: adminMessages().setup.title };

/**
 * The first owner (.claude/rules/beveiliging.md § Authenticatie): open only
 * until one exists — the database has one row in admin_setup, then this page
 * is "not found" for good. Protected meanwhile by ADMIN_SETUP_TOKEN, so no
 * stranger can claim the shop between the deploy and the owner.
 */
export default async function SetupPage() {
  // A new secret for every visit: never from a cache.
  await connection();
  if (!hasDatabase || !(await setupOpen())) notFound();
  const am = adminMessages();
  const m = am.setup;
  const enrolment = setupToken() ? newEnrolment("setup", "eigenaar") : null;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p>{m.intro}</p>
      {enrolment ? (
        <NewAccountForm mode="setup" enrolment={enrolment} m={am.credentials} setup={m} submit={m.submit} doneTitle={m.doneTitle} />
      ) : (
        <p role="status" className="rounded-md border-l-4 border-warning bg-warning-soft p-4">
          {m.missingToken}
        </p>
      )}
    </div>
  );
}
