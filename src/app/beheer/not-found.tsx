import { adminMessages } from "@/lib/admin/messages";

// Plain on purpose: to anyone who is not an admin, /beheer is just a page that does not exist.
export default function AdminNotFound() {
  const m = adminMessages();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-h1 font-bold">{m.notFound.title}</h1>
      <p>{m.notFound.text}</p>
    </div>
  );
}
