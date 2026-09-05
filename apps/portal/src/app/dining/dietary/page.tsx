"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDiningDietary,
  upsertDiningDietary,
  type DiningDietaryRow,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SearchInput,
} from "@/components/ui";

const splitTags = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 30);

export default function DiningDietaryPage() {
  const [rows, setRows] = useState<DiningDietaryRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [studentNo, setStudentNo] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [allergies, setAllergies] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(() => {
    getDiningDietary()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.studentNo.toLowerCase().includes(needle),
        )
      : rows;
  }, [rows, q]);

  async function save() {
    if (!studentNo.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await upsertDiningDietary({
        studentNo: studentNo.trim(),
        restrictions: splitTags(restrictions),
        allergies: splitTags(allergies),
        notes: notes.trim() || undefined,
      });
      setStudentNo("");
      setRestrictions("");
      setAllergies("");
      setNotes("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Dietary Needs"
        subtitle={`${rows.length} profiles · maintained by the dining office`}
      />
      {error && (
        <Card>
          <EmptyState title="Something went wrong" note={error} />
        </Card>
      )}
      <Card>
        <p className="h1" style={{ fontSize: 15, marginBottom: 10 }}>
          Record a profile
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <Input
            value={studentNo}
            onChange={setStudentNo}
            placeholder="Student ID (exact)"
          />
          <Input
            value={restrictions}
            onChange={setRestrictions}
            placeholder="Restrictions, comma separated"
          />
          <Input
            value={allergies}
            onChange={setAllergies}
            placeholder="Allergies, comma separated"
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <Input
              value={notes}
              onChange={setNotes}
              placeholder="Notes for the kitchen (optional)"
            />
          </div>
          <Button
            variant="primary"
            disabled={busy || !studentNo.trim()}
            onClick={() => void save()}
          >
            Save profile
          </Button>
        </div>
        <p
          className="muted"
          style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
        >
          The ID must match exactly — a near-miss is refused rather than
          attached to the wrong student.
        </p>
      </Card>
      <div style={{ height: 16 }} />
      <div style={{ marginBottom: 16, maxWidth: 340 }}>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Filter by name or student ID…"
        />
      </div>
      <Card pad={false}>
        {!filtered.length ? (
          <EmptyState
            title={rows.length ? "No match" : "No profiles yet"}
            note={
              rows.length
                ? "Try a different name or ID."
                : "Record the first profile above."
            }
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>ID</th>
                <th>Plan</th>
                <th>Restrictions</th>
                <th>Allergies</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.studentId}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: "var(--fg3)" }}>{r.studentNo}</td>
                  <td style={{ color: "var(--fg3)" }}>{r.plan}</td>
                  <td>
                    {r.restrictions.length ? (
                      <span
                        style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        {r.restrictions.map((tag) => (
                          <Badge key={tag} tone="warning">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg3)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {r.allergies.length ? (
                      <span
                        style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        {r.allergies.map((tag) => (
                          <Badge key={tag} tone="error">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg3)" }}>—</span>
                    )}
                  </td>
                  <td style={{ color: "var(--fg3)", fontSize: 12 }}>
                    {r.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
