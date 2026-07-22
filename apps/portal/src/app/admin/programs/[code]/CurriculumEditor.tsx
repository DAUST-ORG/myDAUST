"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, Save, X } from "lucide-react";
import {
  type AcademicYearRow,
  type CurriculumData,
  getAcademicYears,
  getCurriculum,
  saveCurriculum,
} from "@/lib/api";
import { Button, EmptyState, Select } from "@/components/ui";

const SEMESTERS = ["Fall", "Spring", "Summer"] as const;
type Semester = (typeof SEMESTERS)[number];
const DEFAULT_YEARS = 4;

// Per-semester pill accents (Fall warm, Spring teal, Summer neutral).
const SEM_PILL: Record<Semester, { bg: string; fg: string }> = {
  Fall: { bg: "rgba(237,132,37,0.14)", fg: "var(--daust-orange)" },
  Spring: { bg: "rgba(20,150,130,0.14)", fg: "#0f8f7d" },
  Summer: { bg: "var(--surface-2)", fg: "var(--fg3)" },
};

// A single editable course dropdown inside one semester panel. The key is stable
// so blank/duplicate rows keep their React identity across edits.
interface Slot {
  key: number;
  yearIndex: number;
  semester: Semester;
  courseCode: string;
}

let slotSeq = 0;

export function CurriculumEditor({ code, name }: { code: string; name: string }) {
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [yearId, setYearId] = useState("");
  const [data, setData] = useState<CurriculumData | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [yearCount, setYearCount] = useState(DEFAULT_YEARS);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    getAcademicYears()
      .then((ys) => {
        setYears(ys);
        const active = ys.find((y) => y.status === "active") ?? ys[0];
        if (active) setYearId(active.id);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!yearId) return;
    loading.current = true;
    setSavedAt(null);
    setErr(null);
    getCurriculum(code, yearId)
      .then((d) => {
        setData(d);
        setSlots(
          d.entries.map((e) => ({
            key: slotSeq++,
            yearIndex: e.yearIndex,
            semester: (SEMESTERS.find((s) => s === e.semester) ?? "Fall") as Semester,
            courseCode: e.courseCode,
          })),
        );
        const maxYear = d.entries.reduce((m, e) => Math.max(m, e.yearIndex), 0);
        setYearCount(Math.max(DEFAULT_YEARS, maxYear));
      })
      .catch(() => setData(null))
      .finally(() => {
        loading.current = false;
      });
  }, [code, yearId]);
  useEffect(() => load(), [load]);

  const creditsByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.allCourses ?? []) m.set(c.code, c.credits);
    return m;
  }, [data]);

  const courseOptions = useMemo(
    () => [
      { value: "", label: "Select course…" },
      ...(data?.allCourses ?? []).map((c) => ({ value: c.code, label: `${c.code} · ${c.title} (${c.credits} cr)` })),
    ],
    [data],
  );

  function addCourse(yearIndex: number, semester: Semester) {
    setSlots((prev) => [...prev, { key: slotSeq++, yearIndex, semester, courseCode: "" }]);
  }
  function setCourse(key: number, courseCode: string) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, courseCode } : s)));
  }
  function removeSlot(key: number) {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  async function save() {
    setErr(null);
    const entries = slots
      .filter((s) => s.courseCode)
      .map((s) => ({ yearIndex: s.yearIndex, semester: s.semester, courseCode: s.courseCode }));
    setBusy(true);
    try {
      await saveCurriculum(code, yearId, entries);
      const year = years.find((y) => y.id === yearId)?.label ?? "";
      setSavedAt(`Curriculum saved for ${name} · ${year} at ${new Date().toLocaleTimeString("fr-SN", { hour: "2-digit", minute: "2-digit" })}`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save curriculum.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ marginBottom: 4 }}>
        <h4 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700 }}>{name} — Curriculum</h4>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
          Courses from the Course Catalog, organised by semester (Fall · Spring · Summer), saved under an academic year.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "14px 0 18px" }}>
        <Select
          value={yearId}
          onChange={setYearId}
          options={years.map((y) => ({ value: y.id, label: `${y.label}${y.status === "active" ? " (active)" : ""}` }))}
          style={{ minWidth: 190 }}
        />
        <span style={{ flex: 1 }} />
        <Button variant="primary" icon={<Save size={15} />} onClick={save} disabled={busy || !yearId}>
          {busy ? "Saving…" : "Save curriculum"}
        </Button>
      </div>

      {err && <div className="badge overdue" style={{ padding: "8px 12px", marginBottom: 14 }}>{err}</div>}
      {savedAt && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--success-50, #e9f7ef)", color: "var(--success)", border: "1px solid var(--success)", borderRadius: 10, padding: "9px 13px", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          <CheckCircle2 size={16} /> {savedAt}
        </div>
      )}

      {!yearId ? (
        <EmptyState title="Select an academic year to edit its curriculum." />
      ) : !data ? (
        <p className="muted">Loading curriculum…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {Array.from({ length: yearCount }, (_, i) => i + 1).map((year) => (
            <YearBlock
              key={year}
              year={year}
              slots={slots.filter((s) => s.yearIndex === year)}
              creditsByCode={creditsByCode}
              courseOptions={courseOptions}
              onAdd={addCourse}
              onSet={setCourse}
              onRemove={removeSlot}
            />
          ))}
          <div>
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setYearCount((n) => Math.min(8, n + 1))}>
              Add year
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function YearBlock({
  year,
  slots,
  creditsByCode,
  courseOptions,
  onAdd,
  onSet,
  onRemove,
}: {
  year: number;
  slots: Slot[];
  creditsByCode: Map<string, number>;
  courseOptions: { value: string; label: string }[];
  onAdd: (year: number, semester: Semester) => void;
  onSet: (key: number, code: string) => void;
  onRemove: (key: number) => void;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div style={{ background: "var(--daust-navy)", color: "#fff", padding: "9px 16px", fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 700 }}>
        Year {year}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, padding: 14 }}>
        {SEMESTERS.map((sem) => {
          const cells = slots.filter((s) => s.semester === sem);
          const credits = cells.reduce((sum, s) => sum + (creditsByCode.get(s.courseCode) ?? 0), 0);
          const pill = SEM_PILL[sem];
          return (
            <div key={sem} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ background: pill.bg, color: pill.fg, borderRadius: 999, padding: "3px 11px", fontSize: 11.5, fontWeight: 700 }}>{sem}</span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{credits} cr</span>
              </div>
              {cells.map((s) => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Select value={s.courseCode} onChange={(v) => onSet(s.key, v)} options={courseOptions} style={{ flex: 1, minWidth: 0 }} />
                  <button onClick={() => onRemove(s.key)} title="Remove course" aria-label="Remove course" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--fg3)", border: "1px solid var(--border)", background: "var(--surface)" }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => onAdd(year, sem)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px dashed var(--border)", background: "transparent", color: "var(--fg3)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", width: "100%" }}
              >
                <Plus size={14} /> Add course
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
