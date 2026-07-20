"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Lock, Plus, X } from "lucide-react";
import {
  type RegistrationCatalog,
  type RegistrationSection,
  enrollSection,
  getCurrentTerm,
  getRegistrationCatalog,
} from "@/lib/api";
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput } from "@/components/ui";

export default function StudentRegistration() {
  const [termId, setTermId] = useState<string | null>(null);
  const [termName, setTermName] = useState<string>("");
  const [data, setData] = useState<RegistrationCatalog | null>(null);
  const [cart, setCart] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback((id: string) => {
    getRegistrationCatalog(id)
      .then(setData)
      .catch((e: Error) => setNote({ kind: "err", text: e.message }));
  }, []);

  useEffect(() => {
    getCurrentTerm()
      .then((t) => {
        setTermId(t.id);
        setTermName(t.name);
        load(t.id);
      })
      .catch((e: Error) => setNote({ kind: "err", text: e.message }));
  }, [load]);

  const byId = useMemo(
    () => new Map((data?.sections ?? []).map((s) => [s.sectionId, s])),
    [data],
  );
  const planned = cart.map((id) => byId.get(id)).filter((s): s is RegistrationSection => !!s);
  const plannedCredits = planned.reduce((s, x) => s + x.credits, 0);
  const totalCredits = (data?.currentCredits ?? 0) + plannedCredits;
  const maxCredits = data?.maxCredits ?? 30;
  const overload = totalCredits > maxCredits;
  const blockedByHold = (data?.holds.length ?? 0) > 0;

  /**
   * Two sections in the plan can clash with each other even when neither clashes
   * with an existing enrolment, so the cart is checked against itself too.
   */
  function clashesWithPlan(s: RegistrationSection): string | null {
    for (const p of planned) {
      if (p.sectionId === s.sectionId) continue;
      const shared = p.days.split("").some(() => true) && overlaps(p, s);
      if (shared) return p.courseCode;
    }
    return null;
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data?.sections ?? [];
    if (!needle) return rows;
    return rows.filter(
      (s) =>
        s.courseCode.toLowerCase().includes(needle) ||
        s.title.toLowerCase().includes(needle) ||
        (s.instructor ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  async function confirm() {
    if (!termId || cart.length === 0 || overload || blockedByHold) return;
    setBusy(true);
    setNote(null);
    const failures: string[] = [];
    // Enrol one at a time: each call re-runs the server-side rules under the
    // section seat-lock, so a section that filled up mid-session fails alone.
    for (const sectionId of cart) {
      try {
        await enrollSection(sectionId);
      } catch (e) {
        const s = byId.get(sectionId);
        failures.push(`${s?.courseCode ?? sectionId}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setCart([]);
    load(termId);
    setBusy(false);
    setNote(
      failures.length === 0
        ? { kind: "ok", text: "Enrolment confirmed — your plan has been added to your schedule." }
        : { kind: "err", text: `Some sections could not be added — ${failures.join(" · ")}` },
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={termName ? `Registration · ${termName}` : "Registration"}
        title="Course registration"
        subtitle={`Build a plan, then confirm. Maximum load is ${maxCredits} credits per term.`}
        actions={<SearchInput value={q} onChange={setQ} placeholder="Search code, title or instructor…" width={280} />}
      />

      {note && (
        <p className="card" style={{ color: note.kind === "ok" ? "var(--success-500)" : "var(--danger)" }}>
          {note.text}
        </p>
      )}

      {blockedByHold && (
        <div
          className="card"
          style={{ display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--error-500)" }}
        >
          <Lock size={17} color="var(--error-500)" />
          <div>
            <strong>Registration is blocked by an active hold.</strong>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              {data?.holds.map((h) => h.reason ?? h.type).join(" · ")} — contact the registrar to clear it.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 18, alignItems: "start" }}>
        <Card pad={false}>
          {!data && <p className="muted" style={{ padding: 18 }}>Loading catalogue…</p>}
          {data && filtered.length === 0 && <EmptyState title="No courses match your search" />}
          {data && filtered.length > 0 && (
            <div>
              {filtered.map((s) => {
                const inCart = cart.includes(s.sectionId);
                const planClash = inCart ? null : clashesWithPlan(s);
                const blocked = s.blockedReason ?? (planClash ? `Clashes with ${planClash}` : null);
                return (
                  <div
                    key={s.sectionId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "13px 16px",
                      borderBottom: "1px solid var(--divider)",
                      borderLeft: `3px solid ${inCart ? "var(--success-500)" : blocked ? "var(--error-400)" : "transparent"}`,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <strong>{s.courseCode}</strong>
                        <span>{s.title}</span>
                        <Badge tone="neutral">{s.credits} cr</Badge>
                        <span className="muted" style={{ fontSize: 12 }}>§{s.sectionCode}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                        {s.schedule} · {s.room ?? "room TBA"} · {s.instructor ?? "staff"} ·{" "}
                        {s.seatsTaken}/{s.capacity} seats
                      </div>
                      {blocked && (
                        <div style={{ fontSize: 12, color: "var(--error-500)", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                          <AlertTriangle size={12} /> {blocked}
                        </div>
                      )}
                    </div>
                    {inCart ? (
                      <Button variant="secondary" size="sm" icon={<Check size={13} />} onClick={() => setCart((c) => c.filter((x) => x !== s.sectionId))}>
                        Added
                      </Button>
                    ) : (
                      <Button
                        variant={blocked ? "ghost" : "primary"}
                        size="sm"
                        disabled={!!blocked || blockedByHold}
                        icon={blocked ? undefined : <Plus size={13} />}
                        onClick={() => setCart((c) => [...c, s.sectionId])}
                      >
                        {blocked ? "Unavailable" : "Add"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Registration plan">
          {planned.length === 0 ? (
            <EmptyState title="No sections planned" note="Add courses from the catalogue to build your plan." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {planned.map((s) => (
                <div key={s.sectionId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.courseCode}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{s.schedule} · {s.credits} cr</div>
                  </div>
                  <button
                    aria-label={`Remove ${s.courseCode}`}
                    onClick={() => setCart((c) => c.filter((x) => x !== s.sectionId))}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg3)", padding: 4 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 12, fontSize: 13 }}>
            <Row label="Currently enrolled" value={`${data?.currentCredits ?? 0} cr`} />
            <Row label="In this plan" value={`${plannedCredits} cr`} />
            <Row
              label="Total load"
              value={`${totalCredits} / ${maxCredits} cr`}
              tone={overload ? "var(--error-500)" : undefined}
              bold
            />
          </div>

          {overload && (
            <p style={{ fontSize: 12.5, color: "var(--error-500)", margin: "10px 0 0" }}>
              Over the {maxCredits}-credit limit — remove a course to continue.
            </p>
          )}

          <div style={{ marginTop: 14 }}>
            <Button
              variant="navy"
              full
              disabled={busy || cart.length === 0 || overload || blockedByHold}
              onClick={confirm}
            >
              {busy
                ? "Enrolling…"
                : blockedByHold
                  ? "Blocked by a hold"
                  : overload
                    ? `Over ${maxCredits} credit limit`
                    : cart.length === 0
                      ? "Add sections to enrol"
                      : `Confirm enrolment (${plannedCredits} cr)`}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: tone, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/** Mirrors the server's clash rule so the cart can self-check before submitting. */
function overlaps(a: RegistrationSection, b: RegistrationSection): boolean {
  const days = (d: string) => {
    const out: string[] = [];
    const src = d.replace(/[\s,]/g, "");
    let i = 0;
    while (i < src.length) {
      const two = src.slice(i, i + 2).toLowerCase();
      if (two === "th" || two === "su") {
        out.push(two.charAt(0).toUpperCase() + two.charAt(1));
        i += 2;
      } else {
        out.push(src.charAt(i).toUpperCase());
        i += 1;
      }
    }
    return out;
  };
  const mins = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
  };
  if (!days(a.days).some((d) => days(b.days).includes(d))) return false;
  const [as, ae, bs, be] = [mins(a.startTime), mins(a.endTime), mins(b.startTime), mins(b.endTime)];
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return as < be && bs < ae;
}
