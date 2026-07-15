"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronDown, HelpCircle, LogOut, Menu, Moon, Repeat, Search, Sun } from "lucide-react";
import {
  type Announcement,
  type Me,
  getAnnouncements,
  getAdminStudents,
  getCurrentTerm,
  getFacultyOverview,
  getMyEnrollments,
  logout,
} from "@/lib/api";
import type { NavGroup } from "./AppShell";

interface SearchHit {
  group: string;
  label: string;
  sub?: string;
  href: string;
}

const AREA_LINKS: { role: string; href: string; label: string }[] = [
  { role: "student", href: "/student", label: "Student Portal" },
  { role: "faculty", href: "/faculty", label: "Teacher Portal" },
  { role: "dining", href: "/dining", label: "Dining Console" },
  { role: "student_affairs", href: "/affairs", label: "Student Affairs" },
  { role: "innovation", href: "/innovation", label: "Innovation Studio" },
  { role: "admin", href: "/admin", label: "Admin Portal" },
  { role: "registrar", href: "/admin", label: "Admin Portal" },
  { role: "bursar", href: "/admin", label: "Admin Portal" },
  { role: "hr", href: "/admin", label: "Admin Portal" },
  { role: "it_admin", href: "/admin", label: "Admin Portal" },
];

const SEEN_KEY = "daust-announcements-seen";

export interface RoleView {
  key: string;
  label: string;
}
export function Topbar({
  me,
  nav,
  pageTitle,
  onToggleNav,
  viewAs,
  onViewAs,
  viewAsRoles,
}: {
  me: Me;
  nav: NavGroup[];
  pageTitle: string;
  onToggleNav: () => void;
  viewAs?: string;
  onViewAs?: (key: string) => void;
  viewAsRoles?: RoleView[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [term, setTerm] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<null | "search" | "bell" | "user" | "role" | "help">(null);
  const [data, setData] = useState<SearchHit[]>([]);
  const [news, setNews] = useState<Announcement[]>([]);
  const [seenAt, setSeenAt] = useState<number>(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dataLoaded = useRef(false);

  const area = pathname.split("/")[1] ?? "";

  useEffect(() => {
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
    getAnnouncements().then(setNews).catch(() => {});
    setSeenAt(Number(localStorage.getItem(SEEN_KEY) ?? 0));
    const saved = (localStorage.getItem("daust-theme") as "light" | "dark") ?? "light";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("daust-theme", next);
    document.documentElement.dataset.theme = next;
  }

  // Role-scoped quick data, fetched once on first search focus.
  const loadSearchData = useCallback(async () => {
    if (dataLoaded.current) return;
    dataLoaded.current = true;
    const hits: SearchHit[] = [];
    try {
      if (me.roles.some((r) => ["admin", "registrar", "bursar"].includes(r))) {
        const students = await getAdminStudents();
        hits.push(...students.map((s) => ({ group: "Students", label: s.name, sub: s.studentNo, href: `/admin/students/${s.id}` })));
      } else if (me.roles.includes("faculty")) {
        const ov = await getFacultyOverview();
        hits.push(...ov.classes.map((c) => ({ group: "My classes", label: `${c.code} — ${c.title}`, sub: c.room ?? undefined, href: `/faculty/classes/${c.sectionId}` })));
      } else if (me.roles.includes("student")) {
        const enr = await getMyEnrollments();
        hits.push(...enr.map((e) => ({ group: "My courses", label: `${e.courseCode} — ${e.title}`, sub: e.schedule, href: `/student/courses/${e.sectionId}` })));
      }
    } catch {
      /* search still works on nav destinations */
    }
    setData(hits);
  }, [me.roles]);

  // ⌘K / "/" focuses search; Escape closes any dropdown.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        setOpen(null);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Click-away closes dropdowns.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const navHits: SearchHit[] = useMemo(
    () => nav.flatMap((g) => g.items.filter((i) => !i.disabled).map((i) => ({ group: "Go to", label: i.label, href: i.href }))),
    [nav],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = [...navHits, ...data];
    return all
      .filter((h) => h.label.toLowerCase().includes(q) || h.sub?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, navHits, data]);

  const unread = news.filter((n) => new Date(n.createdAt).getTime() > seenAt).length;
  const announcementsHref = ["student", "faculty", "admin"].includes(area) ? `/${area}/announcements` : null;

  function openBell() {
    const next = open === "bell" ? null : "bell";
    setOpen(next);
    if (next === "bell") {
      const now = Date.now();
      localStorage.setItem(SEEN_KEY, String(now));
      setSeenAt(now);
    }
  }

  function go(href: string) {
    setOpen(null);
    setQuery("");
    router.push(href);
  }

  async function signOut() {
    await logout();
    router.push("/login");
  }

  const initials = me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const areas = AREA_LINKS.filter((a) => me.roles.includes(a.role)).reduce<typeof AREA_LINKS>(
    (acc, a) => (acc.some((x) => x.href === a.href) ? acc : [...acc, a]),
    [],
  );
  const dropdownCard: React.CSSProperties = {
    position: "absolute",
    top: 46,
    right: 0,
    width: 320,
    background: "var(--surface, #fff)",
    border: "1px solid var(--gray-100)",
    borderRadius: 14,
    boxShadow: "var(--shadow-lg)",
    zIndex: 60,
    overflow: "hidden",
  };

  return (
    <header className="topbar" ref={rootRef as React.RefObject<HTMLDivElement>}>
      <button className="nav-burger" onClick={onToggleNav} aria-label="Menu">
        <Menu size={20} />
      </button>
      <span className="page">{pageTitle}</span>

      {/* Functional global search */}
      <div style={{ position: "relative", flex: 1, maxWidth: 460 }}>
        <div className="search" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px" }}>
          <Search size={15} color="var(--daust-steel)" />
          <input
            ref={inputRef}
            value={query}
            onFocus={() => {
              setOpen("search");
              loadSearchData();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen("search");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) go(results[0].href);
            }}
            placeholder="Search…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--fg1)" }}
          />
          <kbd style={{ fontSize: 10, color: "var(--fg3)", border: "1px solid var(--gray-200)", borderRadius: 5, padding: "1px 5px", background: "var(--surface, #fff)" }}>⌘K</kbd>
        </div>
        {open === "search" && query.trim() && (
          <div style={{ ...dropdownCard, left: 0, right: "auto", width: "100%", top: 42 }}>
            {results.length === 0 && <div className="muted" style={{ padding: "12px 14px", fontSize: 13 }}>No matches.</div>}
            {results.map((r, i) => (
              <button
                key={`${r.href}-${i}`}
                onClick={() => go(r.href)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", borderTop: i > 0 ? "1px solid var(--divider)" : "none" }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--daust-orange)", width: 74, flexShrink: 0 }}>{r.group}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg1)" }}>{r.label}</span>
                {r.sub && <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{r.sub}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="spacer" />

      {/* Term + date chip */}
      {term && (
        <span className="term-chip" style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--gray-50)", border: "1px solid var(--gray-100)", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
          <strong style={{ fontFamily: "var(--font-display)" }}>{term}</strong>
          <span className="muted">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
        </span>
      )}

      {/* Viewing-as role preview (admin only; cosmetic — real authz is server-side) */}
      {viewAsRoles && viewAsRoles.length > 0 && (
        <div style={{ position: "relative" }} className="viewas">
          <button
            onClick={() => setOpen(open === "role" ? null : "role")}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, border: "1px solid var(--gray-100)", background: "var(--surface)", cursor: "pointer", fontSize: 13, color: "var(--fg2)", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            <Repeat size={15} color="var(--daust-orange)" />
            <span className="viewas-label">
              Viewing as: <b style={{ color: "var(--fg1)" }}>{viewAsRoles.find((r) => r.key === viewAs)?.label ?? viewAsRoles[0]?.label}</b>
            </span>
            <ChevronDown size={15} color="var(--fg3)" />
          </button>
          {open === "role" && (
            <div style={{ ...dropdownCard, width: 232, top: 46 }}>
              <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "10px 14px 4px" }}>Preview role access</div>
              {viewAsRoles.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    onViewAs?.(r.key);
                    setOpen(null);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "9px 14px", border: "none", background: r.key === viewAs ? "var(--bg-tint)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: r.key === viewAs ? "var(--daust-navy)" : "var(--fg1)" }}
                >
                  <span style={{ flex: 1 }}>{r.label}</span>
                  {r.key === viewAs && <Check size={15} color="var(--daust-navy)" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Theme toggle */}
      <button onClick={toggleTheme} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--gray-100)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        {theme === "dark" ? <Sun size={17} color="var(--daust-orange)" /> : <Moon size={17} color="var(--daust-navy)" />}
      </button>

      {/* Announcements bell */}
      <div style={{ position: "relative" }}>
        <button onClick={openBell} aria-label="Announcements" style={{ position: "relative", width: 38, height: 38, borderRadius: 10, border: "1px solid var(--gray-100)", background: "var(--surface, #fff)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Bell size={17} color="var(--daust-navy)" />
          {unread > 0 && <span style={{ position: "absolute", top: 6, right: 6, minWidth: 8, height: 8, borderRadius: 99, background: "var(--daust-orange)", border: "1.5px solid var(--surface, #fff)" }} />}
        </button>
        {open === "bell" && (
          <div style={dropdownCard}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--divider)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Announcements</div>
            {news.slice(0, 6).map((n) => (
              <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--daust-orange)", letterSpacing: ".06em", textTransform: "uppercase" }}>{n.category}</span>
                  <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>{new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{n.title}</div>
              </div>
            ))}
            {news.length === 0 && <div className="muted" style={{ padding: "12px 16px", fontSize: 13 }}>Nothing yet.</div>}
            {announcementsHref && (
              <Link href={announcementsHref} onClick={() => setOpen(null)} style={{ display: "block", padding: "10px 16px", fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)", textDecoration: "none" }}>
                View all →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Help */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen(open === "help" ? null : "help")} aria-label="Help" style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--gray-100)", background: "var(--surface, #fff)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <HelpCircle size={17} color="var(--daust-navy)" />
        </button>
        {open === "help" && (
          <div style={dropdownCard}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--divider)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Help & shortcuts</div>
            <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span className="muted">Search anything</span>
                <kbd style={{ fontSize: 11, border: "1px solid var(--gray-200)", borderRadius: 5, padding: "1px 6px" }}>⌘K</kbd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span className="muted">Toggle theme</span>
                <span style={{ fontWeight: 600 }}>Top-right sun/moon</span>
              </div>
            </div>
            <a href="mailto:support@daust.org" style={{ display: "block", padding: "10px 16px", borderTop: "1px solid var(--divider)", fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)" }}>
              Contact IT support →
            </a>
          </div>
        )}
      </div>

      {/* User menu + portal switcher */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen(open === "user" ? null : "user")} style={{ display: "flex", alignItems: "center", gap: 9, border: "1px solid var(--gray-100)", background: "var(--surface, #fff)", borderRadius: 999, padding: "4px 12px 4px 4px", cursor: "pointer" }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--daust-orange)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12 }}>{initials}</span>
          <span className="user-name" style={{ fontSize: 13, fontWeight: 600, color: "var(--fg1)" }}>{me.name.split(" ")[0]}</span>
        </button>
        {open === "user" && (
          <div style={{ ...dropdownCard, width: 260 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{me.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{me.email}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {me.roles.map((r) => <span key={r} className="badge pending" style={{ fontSize: 10 }}>{r}</span>)}
              </div>
            </div>
            {areas.length > 1 && (
              <div style={{ padding: "8px 0", borderBottom: "1px solid var(--divider)" }}>
                <div className="muted" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", padding: "2px 16px 6px" }}>Switch portal</div>
                {areas.map((a) => (
                  <button key={a.href} onClick={() => go(a.href)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 16px", border: "none", background: pathname.startsWith(a.href) ? "var(--gray-50)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: pathname.startsWith(a.href) ? 700 : 500, color: "var(--fg1)" }}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={signOut} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 16px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--danger, #c0392b)" }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
