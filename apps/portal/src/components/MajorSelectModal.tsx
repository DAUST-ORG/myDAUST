"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Search } from "lucide-react";
import { Modal } from "./ui";
import {
  getAvailablePrograms,
  chooseMyMajor,
  type AvailableProgram,
} from "@/lib/api";

/**
 * Full-screen modal that forces a student to choose their major (or "Undecided")
 * before they can interact with the portal. Shown on first login and whenever
 * `majorSelectionDone` is false.
 */
export function MajorSelectModal({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}) {
  const [programs, setPrograms] = useState<AvailableProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getAvailablePrograms()
      .then((p) => {
        setPrograms(p);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load programs. Please refresh.");
        setLoading(false);
      });
  }, [open]);

  const filtered = programs.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.school ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await chooseMyMajor(selected);
      onDone();
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {}}
      title="Choose Your Major"
      width={540}
      footer={
        <button
          className="btn primary"
          disabled={saving}
          onClick={handleConfirm}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
      }
    >
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--fg2)" }}>
        Select the programme you are enrolled in. You can change this later from
        your profile.
      </p>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius)",
            background: "var(--danger-bg, #fef2f2)",
            color: "var(--danger-fg, #b91c1c)",
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--fg2)",
            fontSize: 14,
          }}
        >
          Loading programmes…
        </div>
      ) : (
        <>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--fg2)",
                opacity: 0.5,
              }}
            />
            <input
              type="text"
              placeholder="Search programmes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Undecided option */}
          <button
            onClick={() => setSelected(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "12px 14px",
              borderRadius: "var(--radius)",
              border: `2px solid ${selected === null ? "var(--accent, #ed8425)" : "var(--border)"}`,
              background:
                selected === null
                  ? "var(--accent-bg, #fff7ed)"
                  : "var(--surface)",
              cursor: "pointer",
              marginBottom: 8,
              textAlign: "left",
              transition: "border-color 120ms, background 120ms",
            }}
          >
            <GraduationCap
              size={20}
              style={{
                color:
                  selected === null
                    ? "var(--accent, #ed8425)"
                    : "var(--fg2)",
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Undecided</div>
              <div style={{ fontSize: 12, color: "var(--fg2)" }}>
                I haven&apos;t chosen a programme yet
              </div>
            </div>
          </button>

          <div
            style={{
              maxHeight: 340,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {filtered.map((p) => {
              const isActive = selected === p.code;
              return (
                <button
                  key={p.code}
                  onClick={() => setSelected(p.code)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "var(--radius)",
                    border: `2px solid ${isActive ? "var(--accent, #ed8425)" : "var(--border)"}`,
                    background: isActive
                      ? "var(--accent-bg, #fff7ed)"
                      : "var(--surface)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 120ms, background 120ms",
                  }}
                >
                  <GraduationCap
                    size={20}
                    style={{
                      color: isActive
                        ? "var(--accent, #ed8425)"
                        : "var(--fg2)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg2)" }}>
                      {p.code}
                      {p.degree ? ` · ${p.degree}` : ""}
                      {p.school ? ` · ${p.school}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--fg2)",
                  fontSize: 13,
                }}
              >
                No programmes match your search.
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
