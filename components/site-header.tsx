"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "首页", match: (path: string) => path === "/" },
  {
    href: "/settings",
    label: "设置",
    match: (path: string) => path === "/settings" || path.startsWith("/settings/"),
  },
] as const;

const linkBase = "text-sm text-[#78716c] transition-colors hover:text-[#1c1917]";
const linkActive = "text-[#1c1917]";

export function SiteHeader() {
  const pathname = usePathname() || "/";

  return (
    <header className="shrink-0 border-b border-[#e7e2d9] bg-[#faf8f4]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-[#1c1917]"
          aria-label="NE 首页"
        >
          NE
        </Link>
        <nav className="flex items-center gap-4" aria-label="主导航">
          {NAV_ITEMS.map(({ href, label, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={active ? `${linkBase} ${linkActive}` : linkBase}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
