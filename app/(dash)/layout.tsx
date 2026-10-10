import Link from "next/link";
import { authEnabled } from "@/lib/session";
import { signOut } from "../login/actions";
import { NavLinks } from "./_components/nav-links";

export default function DashLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
              A
            </span>
            <span className="hidden text-sm font-semibold text-stone-900 sm:inline">Aangan Studio</span>
          </Link>
          <NavLinks />
          {authEnabled() && (
            <form action={signOut} className="ml-auto">
              <button type="submit" className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900">
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
