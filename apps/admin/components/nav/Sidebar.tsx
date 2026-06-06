"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 border-b border-border px-5 py-4"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
          ELC
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">ELC Admin</div>
          <div className="text-[11px] text-muted-foreground">
            Eurowindow Light City
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.phase2 && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                  sắp ra mắt
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        © 2026 ELC Proptech · v0.1
      </div>
    </div>
  );
}
