import Link from "next/link";
import { SpecEditor } from "../components/SpecEditor";

export const dynamic = "force-dynamic";

// The ORG scope. Its own page rather than a tab inside Settings, because org defaults are not
// engagement-scoped — burying "how the whole firm delivers" inside one client's settings screen
// would misrepresent what it is, and make it look reversible per engagement when it is not.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;

  return (
    <div className="min-h-screen bg-shell">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
        <div>
          <h1 className="text-[14.5px] font-semibold text-ink">Organisation defaults</h1>
          <p className="text-[11.5px] text-faint">How delivery runs, before any client-specific changes</p>
        </div>
        <Link href="/" className="text-[13px] font-medium text-muted hover:text-ink">← Dashboard</Link>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* `role` comes from the URL, the same place the header's picker writes it, so switching
            role in the app and landing here keeps the same identity. In demo mode that is all the
            identity there is — the editor says so on screen. */}
        <SpecEditor scope="org" role={role ?? ""} />
      </div>
    </div>
  );
}
