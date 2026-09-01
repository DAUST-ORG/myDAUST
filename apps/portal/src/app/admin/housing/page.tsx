"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BedDouble, Building2, History, TriangleAlert } from "lucide-react";
import {
  type AcademicYearRow,
  type HousingOperationsAssignment,
  type HousingOperationsView,
  assignHousingRoom,
  getAcademicYears,
  getHousingOperations,
  releaseHousingRoom,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
} from "@/components/ui";

const xof = (amount: number) => `${amount.toLocaleString("en-US")} XOF`;

type HousingAction = {
  mode: "assign" | "release";
  assignment: HousingOperationsAssignment;
};

function statusTone(status: HousingOperationsAssignment["status"]) {
  if (status === "assigned") return "success" as const;
  if (status === "pending") return "warning" as const;
  return "neutral" as const;
}

export default function HousingOperationsPage() {
  const [years, setYears] = useState<AcademicYearRow[] | null>(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [view, setView] = useState<HousingOperationsView | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<HousingAction | null>(null);
  const [hallId, setHallId] = useState("");
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAcademicYears()
      .then((rows) => {
        setYears(rows);
        setSelectedYear(
          rows.find((year) => year.status === "active")?.label ??
            rows.at(-1)?.label ??
            "",
        );
      })
      .catch((cause: Error) => {
        setYears([]);
        setLoading(false);
        setError(cause.message);
      });
  }, []);

  const load = useCallback(async () => {
    if (!selectedYear) return;
    setLoading(true);
    setError(null);
    try {
      setView(await getHousingOperations(selectedYear));
    } catch (cause) {
      setView(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load housing operations.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return view?.assignments ?? [];
    return (view?.assignments ?? []).filter((assignment) =>
      [
        assignment.studentNo,
        assignment.studentName,
        assignment.billedOption?.label ?? "",
        assignment.hallName ?? "",
        assignment.room ?? "",
        assignment.status,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [query, view]);

  const counts = useMemo(() => {
    const assignments = view?.assignments ?? [];
    return {
      assigned: assignments.filter((row) => row.status === "assigned").length,
      awaiting: assignments.filter((row) => row.status !== "assigned").length,
      warnings: assignments.filter((row) => row.warnings.length > 0).length,
    };
  }, [view]);

  function openAction(
    mode: HousingAction["mode"],
    assignment: HousingOperationsAssignment,
  ) {
    setAction({ mode, assignment });
    setHallId(
      assignment.hallId &&
        view?.halls.some((hall) => hall.id === assignment.hallId)
        ? assignment.hallId
        : (view?.halls.find((hall) => hall.availableBeds > 0)?.id ?? ""),
    );
    setRoom(assignment.status === "unassigned" ? (assignment.room ?? "") : "");
    setReason("");
    setActionError(null);
  }

  async function submitAction() {
    if (!action || !view || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      if (action.mode === "assign") {
        await assignHousingRoom(action.assignment.id, {
          academicYearLabel: view.academicYearLabel,
          expectedUpdatedAt: action.assignment.updatedAt,
          hallId,
          room: room.trim(),
          reason: reason.trim(),
        });
        setNotice(
          `${action.assignment.studentName} was assigned to the selected room. The billed housing option was not changed.`,
        );
      } else {
        await releaseHousingRoom(action.assignment.id, {
          academicYearLabel: view.academicYearLabel,
          expectedUpdatedAt: action.assignment.updatedAt,
          reason: reason.trim(),
        });
        setNotice(
          `${action.assignment.studentName}'s room was released. The hall and room remain on the record as history.`,
        );
      }
      setAction(null);
      await load();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Could not update the housing assignment.",
      );
    } finally {
      setSaving(false);
    }
  }

  const actionValid =
    reason.trim().length >= 5 &&
    (action?.mode === "release" || (Boolean(hallId) && Boolean(room.trim())));

  return (
    <>
      <PageHeader
        eyebrow="Registrar operations"
        title="Housing"
        subtitle="Assign rooms against the approved annual billing profile. Room operations never change Finance pricing or the billed housing option."
        actions={
          <Field label="Academic year">
            <Select
              ariaLabel="Academic year"
              value={selectedYear}
              onChange={setSelectedYear}
              disabled={!years?.length || loading}
              options={(years ?? []).map((year) => ({
                value: year.label,
                label: `${year.label} · ${year.status}`,
              }))}
              style={{ minWidth: 210 }}
            />
          </Field>
        }
      />

      {error && (
        <Card>
          <div role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        </Card>
      )}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 16,
            padding: "11px 14px",
            border:
              "1px solid color-mix(in srgb, var(--success) 35%, var(--border))",
            borderRadius: "var(--radius-md)",
            background: "color-mix(in srgb, var(--success) 8%, var(--surface))",
            color: "var(--fg1)",
            fontSize: 13,
          }}
        >
          {notice}
        </div>
      )}

      {view && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Card>
              <div className="muted" style={{ fontSize: 12 }}>
                Assigned residents
              </div>
              <div className="h1" style={{ marginTop: 3 }}>
                {counts.assigned}
              </div>
            </Card>
            <Card>
              <div className="muted" style={{ fontSize: 12 }}>
                Pending or unassigned
              </div>
              <div className="h1" style={{ marginTop: 3 }}>
                {counts.awaiting}
              </div>
            </Card>
            <Card>
              <div className="muted" style={{ fontSize: 12 }}>
                Operational warnings
              </div>
              <div className="h1" style={{ marginTop: 3 }}>
                {counts.warnings}
              </div>
            </Card>
          </div>

          <Card title="Hall capacity">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 10,
              }}
            >
              {view.halls.map((hall) => (
                <div
                  key={hall.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <strong>{hall.name}</strong>
                    <Badge tone={hall.availableBeds > 0 ? "success" : "error"}>
                      {hall.availableBeds} open
                    </Badge>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {hall.kind} · {hall.occupiedBeds} of {hall.beds} beds
                    assigned
                  </div>
                </div>
              ))}
              {view.halls.length === 0 && (
                <EmptyState
                  icon={<Building2 size={24} />}
                  title="No halls configured"
                  note="Configure a hall before assigning residents."
                />
              )}
            </div>
          </Card>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              margin: "18px 0 10px",
            }}
          >
            <div>
              <h2 className="h1" style={{ fontSize: 18, margin: 0 }}>
                Annual assignments
              </h2>
              <div className="muted" style={{ fontSize: 12 }}>
                {visible.length} of {view.assignments.length} records
              </div>
            </div>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search student, hall, room…"
              width={310}
            />
          </div>

          <Card pad={false}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Billed housing</th>
                    <th>Status</th>
                    <th>Hall / room</th>
                    <th>Warnings</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((assignment) => {
                    const canAssign =
                      assignment.studentRecordStatus === "active" &&
                      assignment.status !== "assigned" &&
                      assignment.billedOption !== null &&
                      assignment.billedOption.code !== "none" &&
                      assignment.billedOption.amountXof > 0;
                    return (
                      <tr key={assignment.id}>
                        <td>
                          <strong>{assignment.studentName}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {assignment.studentNo}
                            {assignment.studentRecordStatus !== "active" &&
                              ` · ${assignment.studentRecordStatus.replaceAll("_", " ")}`}
                          </div>
                        </td>
                        <td>
                          {assignment.billedOption ? (
                            <>
                              <div>{assignment.billedOption.label}</div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {xof(assignment.billedOption.amountXof)}
                              </div>
                            </>
                          ) : (
                            <span className="muted">Not billed</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={statusTone(assignment.status)}>
                            {assignment.status}
                          </Badge>
                        </td>
                        <td>
                          {assignment.hallName || assignment.room ? (
                            <>
                              <div>
                                {[assignment.hallName, assignment.room]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                              {assignment.roomCapacity !== null && (
                                <div className="muted" style={{ fontSize: 11 }}>
                                  {assignment.roomOccupants} of{" "}
                                  {assignment.roomCapacity} billed places
                                  occupied
                                </div>
                              )}
                              {assignment.status === "unassigned" && (
                                <div
                                  className="muted"
                                  style={{
                                    display: "flex",
                                    gap: 4,
                                    alignItems: "center",
                                    fontSize: 11,
                                  }}
                                >
                                  <History size={12} /> retained history
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="muted">No room</span>
                          )}
                        </td>
                        <td>
                          {assignment.warnings.length > 0 ? (
                            <div style={{ display: "grid", gap: 4 }}>
                              {assignment.warnings.map((warning) => (
                                <span
                                  key={warning}
                                  style={{
                                    display: "flex",
                                    gap: 5,
                                    color: "var(--warning)",
                                    fontSize: 11.5,
                                  }}
                                >
                                  <TriangleAlert size={13} /> {warning}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {assignment.status === "assigned" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAction("release", assignment)}
                            >
                              Release room
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="navy"
                              disabled={!canAssign || view.halls.length === 0}
                              onClick={() => openAction("assign", assignment)}
                            >
                              Assign room
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && (
              <EmptyState
                icon={<BedDouble size={24} />}
                title={query ? "No matching assignments" : "No housing records"}
                note={
                  query
                    ? "Try another student number, name, hall, or room."
                    : `No annual housing assignments exist for ${view.academicYearLabel}.`
                }
              />
            )}
          </Card>
        </>
      )}

      {loading && !view && (
        <Card>
          <div className="muted" aria-busy="true">
            Loading annual housing assignments…
          </div>
        </Card>
      )}

      {action && (
        <Modal
          open
          onClose={() => !saving && setAction(null)}
          title={
            action.mode === "assign"
              ? `Assign room · ${action.assignment.studentName}`
              : `Release room · ${action.assignment.studentName}`
          }
          width={540}
          footer={
            <>
              <Button onClick={() => setAction(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant={action.mode === "release" ? "danger" : "navy"}
                onClick={() => void submitAction()}
                disabled={saving || !actionValid}
              >
                {saving
                  ? "Saving…"
                  : action.mode === "assign"
                    ? "Assign room"
                    : "Release room"}
              </Button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                padding: 12,
                borderRadius: "var(--radius-md)",
                background: "var(--surface-2)",
                fontSize: 13,
              }}
            >
              <strong>
                {action.assignment.billedOption?.label ?? "Not billed"}
              </strong>
              <div className="muted" style={{ marginTop: 3 }}>
                {action.assignment.billedOption
                  ? `${xof(action.assignment.billedOption.amountXof)} · ${view?.academicYearLabel}`
                  : "No housing charge"}
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>
                This operation does not change the billed option or price.
              </div>
            </div>

            {action.mode === "assign" ? (
              <>
                <Field label="Hall">
                  <Select
                    ariaLabel="Hall"
                    value={hallId}
                    onChange={setHallId}
                    disabled={saving}
                    options={(view?.halls ?? []).map((hall) => ({
                      value: hall.id,
                      label: `${hall.name} · ${hall.availableBeds} open`,
                    }))}
                  />
                </Field>
                <Field
                  label="Room"
                  hint={
                    action.assignment.roomCapacity === 2
                      ? "Shared rooms permit at most two residents, both with a billed double-room option."
                      : "Individual-room options require exclusive occupancy for the academic year."
                  }
                >
                  <Input
                    value={room}
                    onChange={setRoom}
                    placeholder="e.g. A-12"
                    disabled={saving}
                  />
                </Field>
              </>
            ) : (
              <div style={{ fontSize: 13 }}>
                The active assignment to{" "}
                <strong>
                  {[action.assignment.hallName, action.assignment.room]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>{" "}
                will be released. Hall and room values remain visible as
                historical evidence.
              </div>
            )}

            <Field
              label="Operational reason"
              hint="Required for the housing audit log (at least 5 characters)."
            >
              <Textarea
                value={reason}
                onChange={setReason}
                placeholder="Explain the room assignment or release"
                disabled={saving}
                invalid={Boolean(reason) && reason.trim().length < 5}
              />
            </Field>
            {actionError && (
              <div
                role="alert"
                style={{ color: "var(--danger)", fontSize: 13 }}
              >
                {actionError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
