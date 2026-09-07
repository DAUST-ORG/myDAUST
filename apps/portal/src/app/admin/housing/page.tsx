"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BedDouble, Building2, History, TriangleAlert } from "lucide-react";
import {
  type AcademicYearRow,
  type DormRow,
  type DormsView,
  type HousingOperationsAssignment,
  type HousingOperationsView,
  assignHousingRoom,
  createDorm,
  deleteDormRoom,
  getAcademicYears,
  getDorms,
  getHousingOperations,
  releaseHousingRoom,
  saveDormRoom,
  updateDorm,
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
  const [tab, setTab] = useState<"residents" | "dorms">("residents");

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
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["residents", "dorms"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                border: tab === t ? "1px solid var(--daust-navy)" : "1px solid var(--border)",
                background: tab === t ? "var(--daust-navy)" : "var(--surface)",
                color: tab === t ? "#fff" : "var(--fg2)",
              }}
            >
              {t === "residents" ? "Residents" : "Dorms & rooms"}
            </button>
          ))}
        </div>
      )}

      {view && tab === "residents" && (
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

      {view && tab === "dorms" && (
        <DormsPanel academicYearLabel={view.academicYearLabel} />
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

/**
 * The dorms themselves: buildings with floors, rooms and bed capacity, plus
 * live per-room occupancy for the selected year. Resident assignment stays on
 * the Residents tab; this tab owns the building registry.
 */
function DormsPanel({ academicYearLabel }: { academicYearLabel: string }) {
  const [view, setView] = useState<DormsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHallForm, setShowHallForm] = useState(false);
  const [editingHall, setEditingHall] = useState<DormRow | null>(null);
  const [hallName, setHallName] = useState("");
  const [hallKind, setHallKind] = useState("");
  const [hallBeds, setHallBeds] = useState("0");
  const [roomHallId, setRoomHallId] = useState<string | null>(null);
  const [roomFloor, setRoomFloor] = useState("0");
  const [roomNo, setRoomNo] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("2");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await getDorms(academicYearLabel));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load dorms.");
    }
  }, [academicYearLabel]);
  useEffect(() => {
    void load();
  }, [load]);

  function openHallForm(hall?: DormRow) {
    setEditingHall(hall ?? null);
    setHallName(hall?.name ?? "");
    setHallKind(hall?.kind ?? "");
    setHallBeds(String(hall?.beds ?? 0));
    setShowHallForm(true);
    setError(null);
  }

  async function submitHall() {
    if (!hallName.trim() || !hallKind.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editingHall) {
        await updateDorm(editingHall.id, {
          name: hallName.trim(),
          kind: hallKind.trim(),
          beds: Number(hallBeds) || 0,
        });
        setNotice(`Dorm ${hallName.trim()} updated.`);
      } else {
        await createDorm({
          name: hallName.trim(),
          kind: hallKind.trim(),
          beds: Number(hallBeds) || 0,
        });
        setNotice(`Dorm ${hallName.trim()} added. Add its floors and rooms below.`);
      }
      setShowHallForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the dorm.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRoom(hallId: string) {
    if (!roomNo.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveDormRoom(hallId, {
        floor: Number(roomFloor) || 0,
        roomNo: roomNo.trim(),
        capacity: Number(roomCapacity) || 1,
      });
      setRoomNo("");
      setRoomHallId(null);
      setNotice(`Room ${roomNo.trim()} saved.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the room.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRoom(roomId: string, roomNoLabel: string) {
    if (!confirm(`Delete room ${roomNoLabel}? Only empty rooms can be deleted.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDormRoom(roomId, academicYearLabel);
      setNotice(`Room ${roomNoLabel} deleted.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the room.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <p className="muted">Loading dorms…</p>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button variant="primary" icon={<Building2 size={15} />} onClick={() => openHallForm()}>
          Add dorm
        </Button>
      </div>
      {error && (
        <Card>
          <div role="alert" style={{ color: "var(--danger)" }}>{error}</div>
        </Card>
      )}
      {notice && (
        <p className="muted" role="status" style={{ fontSize: 13 }}>{notice}</p>
      )}
      {view.halls.length === 0 && (
        <EmptyState
          icon={<Building2 size={24} />}
          title="No dorms yet"
          note="Add the first dorm building, then its floors and rooms."
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {view.halls.map((hall) => (
          <Card
            key={hall.id}
            title={`${hall.name} · ${hall.kind}`}
            action={
              <Button size="sm" variant="outline" onClick={() => openHallForm(hall)}>
                Edit dorm
              </Button>
            }
          >
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
              {hall.floors > 0 ? `${hall.floors} floor${hall.floors === 1 ? "" : "s"} · ` : ""}
              {hall.roomCount} managed room{hall.roomCount === 1 ? "" : "s"} ·{" "}
              {hall.occupants} of {hall.managedCapacity} managed beds occupied
              {hall.beds > 0 ? ` · building capacity ${hall.beds}` : ""}
            </p>
            {hall.rooms.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No rooms registered yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Floor</th>
                      <th>Room</th>
                      <th>Beds</th>
                      <th>Occupants</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hall.rooms.map((room) => (
                      <tr key={room.id}>
                        <td>{room.floor}</td>
                        <td style={{ fontWeight: 600 }}>{room.roomNo}</td>
                        <td>{room.capacity}</td>
                        <td>{room.occupants}</td>
                        <td>
                          <Badge tone={room.full ? "error" : "success"}>
                            {room.full ? "Full" : "Open"}
                          </Badge>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy || room.occupants > 0}
                            title={room.occupants > 0 ? "Occupied rooms cannot be deleted" : "Delete room"}
                            onClick={() => void removeRoom(room.id, room.roomNo)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {roomHallId === hall.id ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "flex-end" }}>
                <Field label="Floor">
                  <Input value={roomFloor} onChange={setRoomFloor} placeholder="0" />
                </Field>
                <Field label="Room no">
                  <Input value={roomNo} onChange={setRoomNo} placeholder="e.g. A-12" />
                </Field>
                <Field label="Beds">
                  <Input value={roomCapacity} onChange={setRoomCapacity} placeholder="2" />
                </Field>
                <Button variant="navy" size="sm" disabled={busy || !roomNo.trim()} onClick={() => void submitRoom(hall.id)}>
                  Save room
                </Button>
                <Button size="sm" onClick={() => { setRoomHallId(null); setRoomNo(""); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <Button size="sm" variant="outline" onClick={() => { setRoomHallId(hall.id); setRoomFloor("0"); setRoomNo(""); setRoomCapacity("2"); }}>
                  Add room
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {showHallForm && (
        <Modal
          open
          onClose={() => !busy && setShowHallForm(false)}
          title={editingHall ? `Edit dorm · ${editingHall.name}` : "Add dorm"}
          width={480}
          footer={
            <>
              <Button onClick={() => setShowHallForm(false)} disabled={busy}>Cancel</Button>
              <Button variant="navy" onClick={() => void submitHall()} disabled={busy || !hallName.trim() || !hallKind.trim()}>
                {busy ? "Saving…" : editingHall ? "Save dorm" : "Add dorm"}
              </Button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Dorm name">
              <Input value={hallName} onChange={setHallName} placeholder="e.g. Baobab Hall" />
            </Field>
            <Field label="Kind">
              <Input value={hallKind} onChange={setHallKind} placeholder="e.g. First-year · Mixed" />
            </Field>
            <Field label="Building bed capacity">
              <Input value={hallBeds} onChange={setHallBeds} placeholder="0" />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
