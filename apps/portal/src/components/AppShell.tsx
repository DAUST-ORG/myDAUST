"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, logout, type Me } from "@/lib/api";
import { Topbar } from "./Topbar";

export interface NavItem {
  href: string;
  label: string;
  count?: number;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function AppShell({
  variant,
  portalName,
  nav,
  children,
}: {
  variant: "navy" | "light";
  portalName: string;
  nav: NavGroup[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => router.replace("/login"))
      .finally(() => setReady(true));
  }, [router]);

  if (!ready) return null;
  if (!me) return null;

  const flat = nav.flatMap((g) => g.items);
  const active = flat
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const pageTitle = active?.label ?? portalName;
  const initials = me.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  async function signOut() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="shell">
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${variant} ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <img src="/logo-daust.png" alt="DAUST" className="wordmark" style={{ height: 26, width: "auto", filter: "brightness(0) invert(1)" }} />
          <div className="tri-dash">
            <span />
            <span />
            <span />
          </div>
          <div className="portal-sub">{portalName}</div>
        </div>

        {nav.map((group, gi) => (
          <div key={gi}>
            {group.label && <div className="side-label">{group.label}</div>}
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setNavOpen(false)}
                className={`nav-item ${active?.href === item.href ? "active" : ""}`}
              >
                {item.label}
                {item.count !== undefined && <span className="count">{item.count}</span>}
              </Link>
            ))}
          </div>
        ))}

        <div className="side-foot">
          <span className="avatar">{initials}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {me.name}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{me.roles.join(", ")}</div>
          </div>
          <button onClick={signOut} title="Sign out" style={{ padding: "5px 9px" }}>⏻</button>
        </div>
      </aside>

      <div className="main">
        <Topbar me={me} nav={nav} pageTitle={pageTitle} onToggleNav={() => setNavOpen((v) => !v)} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
