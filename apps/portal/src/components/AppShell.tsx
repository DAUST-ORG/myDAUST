"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { getMe, getNavContext, type Me } from "@/lib/api";
import type { BadgeKey } from "@/lib/nav";
import { Topbar } from "./Topbar";

export interface NavItem {
  href: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
  disabled?: boolean;
  badgeKey?: BadgeKey;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * The design's "VIEW AS" switcher previews another portal's sidebar. It is offered
 * to the `admin` role only, and lists just the portals that role can actually open —
 * authorization stays server-side, so pointing it at a portal admin holds no role for
 * would only produce 403s.
 */
export interface ViewAsOption {
  key: string;
  label: string;
  href: string;
}

export function AppShell({
  variant,
  portalName,
  portalMeta,
  nav,
  children,
  viewAs,
  viewAsOptions,
  profileHref,
}: {
  variant: "navy" | "light";
  portalName: string;
  portalMeta: string;
  nav: NavGroup[];
  children: React.ReactNode;
  viewAs?: string;
  viewAsOptions?: ViewAsOption[];
  profileHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [badges, setBadges] = useState<Partial<Record<BadgeKey, string>>>({});
  const [meta, setMeta] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => router.replace("/login"))
      .finally(() => setReady(true));
  }, [router]);

  // Badges and the identity line are decoration: a failure must never blank the
  // shell, and the portal's static label stands in when there is no richer meta.
  useEffect(() => {
    getNavContext()
      .then((c) => {
        setBadges(c.badges);
        setMeta(c.meta);
      })
      .catch(() => {});
  }, [pathname]);

  if (!ready) return null;
  if (!me) return null;

  const flat = nav.flatMap((g) => g.items);
  const active = flat
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const initials = me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const identity = (
    <>
      <span className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>{initials}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {me.name}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta ?? portalMeta}
        </div>
      </div>
      <ChevronRight size={15} color="rgba(255,255,255,.5)" />
    </>
  );

  return (
    <div className="shell">
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${variant} ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <img src="/logo-daust.png" alt="DAUST" className="wordmark" style={{ height: 22, width: "auto", display: "block", filter: "brightness(0) invert(1)" }} />
          <div className="tri-dash">
            <span />
            <span />
            <span />
          </div>
          <div className="portal-sub">{portalName}</div>
        </div>

        <nav className="side-nav">
          {nav.map((group, gi) => (
            <div key={gi}>
              {group.label && <div className="side-label">{group.label}</div>}
              {group.items.map((item) => {
                const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
                return item.disabled ? (
                  <div key={item.href} className="nav-item disabled" aria-disabled="true" title="Not available yet">
                    {item.icon && <item.icon className="nav-ico" size={17} />}
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setNavOpen(false)}
                    className={`nav-item ${active?.href === item.href ? "active" : ""}`}
                  >
                    {item.icon && <item.icon className="nav-ico" size={17} />}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {badge && <span className="count">{badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {profileHref ? (
          <Link href={profileHref} className="side-foot">{identity}</Link>
        ) : (
          <div className="side-foot">{identity}</div>
        )}

        {viewAsOptions && viewAsOptions.length > 0 && (
          <div className="side-viewas">
            <div className="viewas-cap">View as</div>
            <div className="viewas-grid">
              {viewAsOptions.map((o) => (
                <button
                  key={o.key}
                  className={o.key === viewAs ? "on" : ""}
                  onClick={() => router.push(o.href)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="main">
        <Topbar me={me} nav={nav} onToggleNav={() => setNavOpen((v) => !v)} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
