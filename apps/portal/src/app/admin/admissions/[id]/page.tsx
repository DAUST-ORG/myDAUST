"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2, Clock, Flag, Gift, GraduationCap, MapPin, Pencil, Target, UserCheck, X } from "lucide-react";
import { type ApplicantDetail, createStudent, getApplicant, getAdminPrograms, setApplicantStage } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Avatar, Badge, type BadgeTone, Field, Modal, Tabs } from "@/components/ui";
import { ApplicationModal, type ProgramOption } from "../ApplicationModal";

const STAGES = ["submitted", "review", "interview", "offer", "accepted"];
const STAGE_TONE: Record<string, BadgeTone> = { submitted: "neutral", review: "info", interview: "warning", offer: "teal", accepted: "success", rejected: "error" };
const STAGE_LABEL: Record<string, string> = { submitted: "Submitted", review: "Under review", interview: "Interview", offer: "Offer", accepted: "Accepted", rejected: "Rejected" };

function nextStage(stage: string): string | null {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1]! : null;
}

export default function ApplicantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<ApplicantDetail | null>(null);
  const [tab, setTab] = useState("overview");
  const [enrolling, setEnrolling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);

  const load = useCallback(() => {
    getApplicant(id).then(setA).catch(() => setA(null));
  }, [id]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    getAdminPrograms()
      .then((p) => setProgramOptions(p.programs.map((x) => ({ code: x.code, name: x.name }))))
      .catch(() => {});
  }, []);

  async function move(stage: string) {
    await setApplicantStage(id, stage);
    load();
  }

  if (!a) return <p className="muted">Loading…</p>;

  const reachedIdx = a.stage === "rejected" ? -1 : STAGES.indexOf(a.stage);
  const timeline: [string, boolean][] = [
    ["Application submitted", true],
    ["Under academic review", reachedIdx >= 1],
    ["Interview", reachedIdx >= 2],
    ["Offer extended", reachedIdx >= 3],
    [a.stage === "rejected" ? "Application rejected" : "Enrolled / accepted", reachedIdx >= 4 || a.stage === "rejected"],
  ];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Link href="/admin/admissions" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg3)", fontWeight: 600, fontSize: 13.5 }}>
          <ArrowLeft size={16} /> All applicants
        </Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setEditing(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}><Pencil size={15} /> Edit</button>
          {a.stage !== "rejected" && a.stage !== "accepted" && (
            <>
              <button onClick={() => move("rejected")} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--danger)" }}><X size={15} /> Reject</button>
              {nextStage(a.stage) && nextStage(a.stage) !== "accepted" && (
                <button onClick={() => move(nextStage(a.stage)!)} style={{ display: "flex", alignItems: "center", gap: 6 }}><ArrowRight size={15} /> Advance</button>
              )}
              <button className="primary" onClick={() => move(a.stage === "offer" ? "accepted" : "offer")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={15} /> {a.stage === "offer" ? "Accept" : "Make offer"}
              </button>
            </>
          )}
          {a.stage === "accepted" && (
            <button className="primary" onClick={() => setEnrolling(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}><UserCheck size={15} /> Enroll student</button>
          )}
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: "linear-gradient(120deg, var(--daust-navy), var(--daust-navy-deep))", borderRadius: "var(--radius-xl)", padding: "26px 28px", color: "#fff", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <Avatar name={a.name} size={72} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}>{a.name}</div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{a.id.slice(0, 8)} · {a.email}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <HeroPill icon={GraduationCap}>{a.program ?? a.programCode ?? "Undeclared"}</HeroPill>
            {a.country && <HeroPill icon={MapPin}>{a.country}</HeroPill>}
            <HeroPill icon={Flag}>{STAGE_LABEL[a.stage] ?? a.stage}</HeroPill>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="card" style={{ marginTop: 16, marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {STAGES.map((st, i) => {
            const done = reachedIdx >= i;
            return (
              <div key={st} style={{ flex: i < STAGES.length - 1 ? 1 : "0 0 auto", display: "flex", alignItems: "center", minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: done ? "var(--daust-navy)" : "var(--bg-subtle)", border: done ? "none" : "1px solid var(--border)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {done ? <Check size={15} /> : <span style={{ color: "var(--fg3)", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: done ? "var(--fg1)" : "var(--fg3)", whiteSpace: "nowrap" }}>{STAGE_LABEL[st]}</span>
                </div>
                {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: reachedIdx > i ? "var(--daust-navy)" : "var(--border)", margin: "0 6px", marginBottom: 20 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginTop: 16 }}>
        <Stat icon={Target} label="BAC score" value={a.score != null ? `${a.score} / 20` : "—"} color="var(--daust-navy)" />
        <Stat icon={BadgeCheck} label="Application fee" value={a.feePaid ? "Paid" : "Due"} color={a.feePaid ? "var(--success)" : "var(--warning)"} />
        <Stat icon={Gift} label="Merit scholarship" value={a.scholarship.pct > 0 ? `${a.scholarship.pct}%` : "None"} color={a.scholarship.pct > 0 ? "var(--success)" : "var(--fg1)"} />
      </div>

      <div style={{ marginTop: 22 }}>
        <Tabs tabs={[{ value: "overview", label: "Overview" }, { value: "timeline", label: "Timeline" }]} active={tab} onChange={setTab} />
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
          <Card title="Applicant">
            <KV k="Full name" v={a.name} />
            <KV k="Email" v={a.email} />
            <KV k="Country" v={a.country ?? "—"} />
            <KV k="Application ID" v={a.id.slice(0, 8)} />
          </Card>
          <Card title="Application">
            <KV k="Applying to" v={a.program ?? a.programCode ?? "Undeclared"} />
            <KV k="Submitted" v={a.submittedAt.slice(0, 10)} />
            <KV k="Current stage" v={<Badge tone={STAGE_TONE[a.stage] ?? "neutral"}>{STAGE_LABEL[a.stage] ?? a.stage}</Badge>} />
            <KV k="Application fee" v={a.feePaid ? "Paid" : `${formatXof(a.appFee)} due`} />
          </Card>
          <Card title="Scholarship (est.)">
            <KV k="BAC score" v={a.score != null ? `${a.score} / 20` : "—"} />
            <KV k="Merit award" v={a.scholarship.pct > 0 ? `${a.scholarship.pct}%` : "No award"} />
            <KV k="Band" v={a.scholarship.band ?? "—"} />
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>Computed from the current BAC scholarship tiers; confirmed at enrolment.</p>
          </Card>
        </div>
      )}

      {tab === "timeline" && (
        <Card title="Application timeline">
          {timeline.map(([label, done], i) => (
            <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--bg-subtle)", border: "1px solid var(--border)", color: done ? "var(--success)" : "var(--fg3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                </span>
                {i < timeline.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 16, background: "var(--border)", marginTop: 2 }} />}
              </div>
              <div style={{ paddingTop: 5, fontSize: 13.5, fontWeight: 600, color: done ? "var(--fg1)" : "var(--fg3)" }}>{label}</div>
            </div>
          ))}
        </Card>
      )}

      {enrolling && (
        <EnrollFromApplicant applicant={a} onClose={() => setEnrolling(false)} onEnrolled={(sid) => router.push(`/admin/students/${sid}`)} />
      )}

      {editing && (
        <ApplicationModal
          mode="edit"
          applicantId={a.id}
          programs={programOptions}
          initial={{
            firstName: a.firstName,
            lastName: a.lastName,
            email: a.email,
            programCode: a.programCode,
            score: a.score,
            country: a.country,
          }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </>
  );
}

function EnrollFromApplicant({ applicant, onClose, onEnrolled }: { applicant: ApplicantDetail; onClose: () => void; onEnrolled: (studentId: string) => void }) {
  const [dob, setDob] = useState("");
  const [billTuition, setBillTuition] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!dob) {
      setErr("Date of birth is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createStudent({
        fullName: applicant.name,
        dateOfBirth: dob,
        email: applicant.email,
        programCode: applicant.programCode ?? undefined,
        billTuition,
      });
      onEnrolled(res.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not enroll.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Enroll student" width={440}
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={submit} disabled={busy}>{busy ? "Enrolling…" : "Enroll student"}</button></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Create a student record for <strong>{applicant.name}</strong> ({applicant.program ?? "no program"}).</p>
        <Field label="Date of birth" hint="Required — the payment-portal second factor"><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={billTuition} onChange={(e) => setBillTuition(e.target.checked)} style={{ width: 16, height: 16 }} />
          Bill standard tuition
        </label>
      </div>
    </Modal>
  );
}

function HeroPill({ icon: Icon, children }: { icon: typeof Target; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, color: "#fff" }}>
      <Icon size={13} color="#a9c4ec" />{children}
    </span>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof Target; label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "var(--fg3)" }}>
        <Icon size={14} color="var(--daust-navy)" /> {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginTop: 8, color }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <h4 style={{ margin: "0 0 12px", fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 700 }}>{title}</h4>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "9px 0", borderBottom: "1px solid var(--divider)", fontSize: 13 }}>
      <span className="muted">{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}
