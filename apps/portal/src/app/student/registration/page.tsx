"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Info,
  Lock,
  MapPin,
  SearchX,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import {
  Button,
  Card,
  Modal,
  PageHeader,
  SearchInput,
} from "@/components/ui";
import {
  type RegistrationCatalog,
  type RegistrationSection,
  type EnrollmentOverrideGate,
  enrollSection,
  getCurrentTerm,
  getRegistrationCatalog,
  submitEnrollmentOverride,
} from "@/lib/api";
import { COURSE_COLORS, hourFloat, parseDayIndexes } from "@/lib/student-schedule";

const isConflict = (reason: string) => /conflict|clash|overlap/i.test(reason);

type OverrideResult = { kind: "ok" | "err"; text: string };

export default function StudentRegistration() {
  const [termId, setTermId] = useState<string | null>(null);
  const [termName, setTermName] = useState("");
  const [data, setData] = useState<RegistrationCatalog | null>(null);
  const [cart, setCart] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [justEnrolled, setJustEnrolled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<RegistrationSection | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideResult, setOverrideResult] = useState<OverrideResult | null>(null);

  const load = useCallback((id: string) => {
    getRegistrationCatalog(id)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    getCurrentTerm()
      .then((t) => {
        setTermId(t.id);
        setTermName(t.name);
        load(t.id);
      })
      .catch((e: Error) => setError(e.message));
  }, [load]);

  const byId = useMemo(
    () => new Map((data?.sections ?? []).map((s) => [s.sectionId, s])),
    [data],
  );
  const planned = cart.map((id) => byId.get(id)).filter((s): s is RegistrationSection => !!s);
  const plannedCredits = planned.reduce((s, x) => s + x.credits, 0);
  const currentCredits = data?.currentCredits ?? 0;
  const totalCredits = currentCredits + plannedCredits;
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
      if (overlaps(p, s)) return p.courseCode;
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

  // Up to three suggested sections pulled from this term's catalogue: they must be
  // open to the student (not blocked) and must not clash with the rest of the plan.
  const recommended = useMemo(() => {
    const out: string[] = [];
    for (const s of data?.sections ?? []) {
      if (out.length >= 3) break;
      if (s.blockedReason || cart.includes(s.sectionId)) continue;
      if (clashesWithPlan(s)) continue;
      out.push(s.sectionId);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cart]);

  async function confirm() {
    if (!termId || cart.length === 0 || overload || blockedByHold) return;
    setBusy(true);
    setError(null);
    setJustEnrolled(false);
    const failures: string[] = [];
    for (const sectionId of cart) {
      try {
        await enrollSection(sectionId);
      } catch (e) {
        const s = byId.get(sectionId);
        failures.push(`${s?.courseCode ?? sectionId}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setCart([]);
    setQ("");
    load(termId);
    setBusy(false);
    if (failures.length === 0) setJustEnrolled(true);
    else setError(`Some sections could not be added — ${failures.join(" · ")}`);
  }

  async function submitOverride() {
    if (!overrideTarget || overrideReason.trim().length < 1) return;
    const wordCount = overrideReason.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 50) return;
    setOverrideSubmitting(true);
    setOverrideResult(null);
    try {
      const gates = extractFailedGates(overrideTarget.blockedReason ?? "");
      await submitEnrollmentOverride({
        sectionId: overrideTarget.sectionId,
        reason: overrideReason,
        requestedWaivers: gates,
      });
      setOverrideResult({
        kind: "ok",
        text: "Override request submitted. Your instructor will review it.",
      });
      setOverrideReason("");
    } catch (e) {
      setOverrideResult({
        kind: "err",
        text: e instanceof Error ? e.message : "Could not submit request.",
      });
    } finally {
      setOverrideSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Course Registration"
        subtitle={`${termName || "This term"} · Registration window open. Add sections to your plan and enroll.`}
      />

      {justEnrolled && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            marginBottom: 16,
            borderRadius: "var(--radius-lg)",
            background: "rgba(46,125,82,.10)",
            border: "1px solid rgba(46,125,82,.3)",
            color: "#1f6b42",
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={17} />
          Enrollment confirmed — your plan has been added to your schedule.
        </div>
      )}

      {error && (
        <p className="card" style={{ color: "var(--error-500)" }}>{error}</p>
      )}

      {blockedByHold && (
        <div
          className="card"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            borderColor: "var(--error-500)",
          }}
        >
          <Lock size={17} color="var(--error-500)" />
          <div>
            <strong>Registration is blocked by an active hold.</strong>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              {data?.holds.map((h) => h.reason ?? h.type).join(" · ")} — contact the
              registrar to clear it.
            </p>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 340px",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div>
          <div style={{ marginBottom: 14 }}>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search by course code, title or instructor…"
              width="100%"
            />
          </div>

          {!data && <p className="muted">Loading catalogue…</p>}

          {data && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "44px 20px" }}>
              <SearchX size={34} color="var(--fg-faint)" />
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
                {q ? `No courses match "${q}"` : "No open sections for this term."}
              </p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((s, i) => {
              const inCart = cart.includes(s.sectionId);
              const planClash = inCart ? null : clashesWithPlan(s);
              const reason =
                s.blockedReason ?? (planClash ? `Time conflict with ${planClash}` : null);
              const conflict = !!reason && isConflict(reason);
              const border = inCart
                ? "rgba(46,125,82,.35)"
                : reason
                  ? "rgba(192,57,43,.35)"
                  : "var(--border)";
              return (
                <div
                  key={s.sectionId}
                  className="sis-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    background: "var(--surface)",
                    border: `1px solid ${border}`,
                    borderLeft: `4px solid ${COURSE_COLORS[i % COURSE_COLORS.length]}`,
                    borderRadius: "var(--radius-lg)",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 16,
                          fontWeight: 700,
                        }}
                      >
                        {s.courseCode}
                      </span>
                      <span
                        style={{
                          padding: "2px 9px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--accent-bg)",
                          color: "var(--daust-navy)",
                          fontSize: 11.5,
                          fontWeight: 700,
                        }}
                      >
                        {s.credits} cr
                      </span>
                      {recommended.includes(s.sectionId) && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 9px",
                            borderRadius: "var(--radius-pill)",
                            background: "var(--daust-orange)",
                            color: "#fff",
                            fontSize: 11.5,
                            fontWeight: 700,
                          }}
                        >
                          <Sparkles size={11} /> Recommended
                        </span>
                      )}
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        §{s.sectionCode}
                      </span>
                      {conflict && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 9px",
                            borderRadius: "var(--radius-pill)",
                            background: "rgba(192,57,43,.10)",
                            color: "var(--error-500)",
                            fontSize: 11.5,
                            fontWeight: 700,
                          }}
                        >
                          <AlertTriangle size={11} /> Time conflict
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 3 }}>
                      {s.title}
                    </div>
                    <div
                      className="muted"
                      style={{
                        display: "flex",
                        gap: 14,
                        flexWrap: "wrap",
                        fontSize: 12.5,
                        marginTop: 6,
                      }}
                    >
                      <Meta icon={<User size={12} />} text={s.instructor ?? "Staff"} />
                      <Meta icon={<Clock size={12} />} text={s.schedule} />
                      <Meta icon={<MapPin size={12} />} text={s.room ?? "Room TBA"} />
                      <Meta
                        icon={<Users size={12} />}
                        text={`${s.seatsTaken}/${s.capacity} seats`}
                      />
                    </div>
                    {reason && !conflict && (
                      <div
                        style={{ fontSize: 12, color: "var(--error-500)", marginTop: 6 }}
                      >
                        {reason}
                      </div>
                    )}
                  </div>

                  {inCart ? (
                    <button
                      onClick={() => setCart((c) => c.filter((x) => x !== s.sectionId))}
                      style={{
                        ...PILL,
                        background: "rgba(46,125,82,.12)",
                        color: "#1f6b42",
                        border: "1px solid rgba(46,125,82,.3)",
                      }}
                    >
                      ✓ Added
                    </button>
                  ) : reason || blockedByHold ? (
                    <button
                      onClick={() => {
                        setOverrideTarget(s);
                        setOverrideReason("");
                        setOverrideResult(null);
                      }}
                      style={{
                        ...PILL,
                        background: "var(--bg-subtle)",
                        color: "var(--daust-navy)",
                        border: "1px solid var(--daust-navy)",
                        cursor: "pointer",
                      }}
                    >
                      Request override
                    </button>
                  ) : (
                    <button
                      onClick={() => setCart((c) => [...c, s.sectionId])}
                      style={{
                        ...PILL,
                        background: "var(--daust-orange)",
                        color: "#fff",
                        border: "1px solid transparent",
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ position: "sticky", top: 18 }}>
          <Card
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ClipboardList size={17} color="var(--daust-orange)" />
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: 15.5,
                    fontWeight: 700,
                  }}
                >
                  Registration plan
                </h3>
              </div>
            }
          >
            <p className="muted" style={{ margin: "-8px 0 12px", fontSize: 12.5 }}>
              {cart.length} section(s) selected
            </p>

            {planned.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--fg-faint)",
                  fontSize: 13,
                  margin: "18px 0",
                }}
              >
                No sections added yet
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {planned.map((s) => (
                  <div
                    key={s.sectionId}
                    style={{ display: "flex", alignItems: "center", gap: 9 }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {s.courseCode}
                    </span>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      §{s.sectionCode} · {s.schedule}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              <Row label="Current credits" value={`${currentCredits} cr`} />
              <Row label="Planned" value={`${plannedCredits} cr`} />
              <Row
                label="Total"
                value={`${totalCredits} cr`}
                tone={overload ? "var(--error-500)" : undefined}
                bold
              />
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
              }}
            >
              <Button
                variant="primary"
                onClick={confirm}
                disabled={
                  busy ||
                  cart.length === 0 ||
                  overload ||
                  blockedByHold
                }
              >
                {busy
                  ? "Enrolling…"
                  : `Enroll in ${cart.length} section${cart.length === 1 ? "" : "s"}`}
              </Button>
              {overload && (
                <p
                  className="muted"
                  style={{ color: "var(--error-500)", fontSize: 11.5 }}
                >
                  <Info size={11} /> Over the {maxCredits}-credit ceiling.
                </p>
              )}
              {blockedByHold && (
                <p
                  className="muted"
                  style={{ color: "var(--error-500)", fontSize: 11.5 }}
                >
                  <Lock size={11} /> Resolve holds before enrolling.
                </p>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: 7,
                alignItems: "center",
                marginTop: 12,
                fontSize: 11.5,
                color: "var(--fg3)",
              }}
            >
              <Info size={12} /> Maximum load: {maxCredits} credits per semester
            </div>
          </Card>
        </div>
      </div>

      <OverrideRequestModal
        target={overrideTarget}
        reason={overrideReason}
        onReasonChange={setOverrideReason}
        submitting={overrideSubmitting}
        result={overrideResult}
        onClose={() => setOverrideTarget(null)}
        onSubmit={submitOverride}
      />
    </>
  );
}

const PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: "var(--radius-pill)",
  fontSize: 12.5,
  fontWeight: 700,
  fontFamily: "var(--font-body)",
  whiteSpace: "nowrap",
  cursor: "pointer",
  border: "1px solid transparent",
};

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {icon}
      {text}
    </span>
  );
}

function Row({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: string;
  bold?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span className="muted">{label}</span>
      <span
        style={{
          fontWeight: bold ? 700 : 500,
          color: tone,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Mirrors the server's clash rule so the cart can self-check before submitting. */
function overlaps(a: RegistrationSection, b: RegistrationSection): boolean {
  const da = parseDayIndexes(a.days);
  const db = parseDayIndexes(b.days);
  if (!da.some((d) => db.includes(d))) return false;
  const [as, ae, bs, be] = [
    hourFloat(a.startTime),
    hourFloat(a.endTime),
    hourFloat(b.startTime),
    hourFloat(b.endTime),
  ];
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return as < be && bs < ae;
}

/**
 * Translate the free-text blockedReason from registrationCatalog into the structured
 * gate set we ask the registrar to waive. This is intentionally a hint -- the registrar
 * still picks the gates to approve on the review screen.
 */
function extractFailedGates(reason: string): EnrollmentOverrideGate[] {
  const out: EnrollmentOverrideGate[] = [];
  const r = reason.toLowerCase();
  if (/prereq|prerequisite/.test(r)) out.push("prerequisite");
  if (/coreq|corequisite/.test(r)) out.push("corequisite");
  if (/full|capacity|seat/.test(r)) out.push("capacity");
  if (/hold/.test(r)) out.push("holds");
  if (/\bcredit\b/.test(r)) out.push("credit_cap");
  if (/standing|level/.test(r)) out.push("standing");
  if (/major|program|restricted/.test(r)) out.push("major_restriction");
  if (/installment|verified|payment|record.?status/.test(r)) out.push("record_status");
  if (/deadline|window|closed/.test(r)) out.push("add_deadline");
  return out;
}

function OverrideRequestModal({
  target,
  reason,
  onReasonChange,
  submitting,
  result,
  onClose,
  onSubmit,
}: {
  target: RegistrationSection | null;
  reason: string;
  onReasonChange: (v: string) => void;
  submitting: boolean;
  result: OverrideResult | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal open={!!target} onClose={onClose} title="Request enrollment override">
      {target && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <strong style={{ fontFamily: "var(--font-display)" }}>
              {target.courseCode} — {target.title}
            </strong>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
              §{target.sectionCode} · {target.schedule}
            </div>
            {target.blockedReason && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "rgba(192,57,43,.07)",
                  borderLeft: "3px solid var(--error-500)",
                  fontSize: 13,
                }}
              >
                <strong>Why you were blocked:</strong> {target.blockedReason}
              </div>
            )}
          </div>
          <label style={{ fontSize: 12.5, color: "var(--fg3)" }}>
            Reason for your instructor (max 50 words)
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={4}
              maxLength={500}
              style={{
                width: "100%",
                marginTop: 4,
                padding: "9px 11px",
                fontFamily: "var(--font-body)",
                fontSize: 13.5,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
              }}
            />
            <div
              className="muted"
              style={{
                fontSize: 11.5,
                marginTop: 3,
                color:
                  reason.trim().split(/\s+/).filter(Boolean).length > 50
                    ? "var(--error-500)"
                    : undefined,
              }}
            >
              {reason.trim().split(/\s+/).filter(Boolean).length} / 50 words
            </div>
          </label>
          {result && (
            <div
              style={{
                fontSize: 12.5,
                color: result.kind === "ok" ? "#1f6b42" : "var(--error-500)",
                fontWeight: 600,
              }}
            >
              {result.text}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="navy"
              onClick={onSubmit}
              disabled={
                submitting ||
                reason.trim().split(/\s+/).filter(Boolean).length === 0 ||
                reason.trim().split(/\s+/).filter(Boolean).length > 50
              }
            >
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
