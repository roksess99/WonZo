import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin/access";
import { setupOpen, setupToken } from "@/lib/admin/auth";
import { adminMessages } from "@/lib/admin/messages";
import { hasDatabase } from "@/lib/db";
import { LoginForm } from "@/components/admin/auth/LoginForm";

export const metadata = { title: adminMessages().login.title };

/**
 * The way into the panel (D-07). Already logged in: to the dashboard. The
 * link to the setup page shows only while it is open and configured.
 */
export default async function LoginPage({ searchParams }: PageProps<"/beheer/inloggen">) {
  const m = adminMessages().login;
  const admin = await currentAdmin();
  // The local way in (ADMIN_DEV_LOGIN) does not skip this page: logging in can be tried locally too.
  if (admin && admin.id !== "dev") redirect("/beheer");
  const { uitgelogd } = await searchParams;
  const showSetup = hasDatabase && setupToken() !== null && (await setupOpen());
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p>{m.intro}</p>
      {uitgelogd ? (
        <p role="status" className="rounded-md bg-surface p-3 ring-1 ring-line">
          {m.loggedOut}
        </p>
      ) : null}
      <LoginForm m={m} />
      <p className="text-body-sm text-muted">{m.session}</p>
      {showSetup ? (
        <Link href="/beheer/opzetten" className="underline underline-offset-4">
          {m.setupLink}
        </Link>
      ) : null}
    </div>
  );
}
