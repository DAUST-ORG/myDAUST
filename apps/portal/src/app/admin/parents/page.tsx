"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  KeyRound,
  Mail,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  type AdminStudentDirectoryRow,
  type GuardianProvisionedLogin,
  type GuardianRow,
  createGuardian,
  deleteGuardian,
  getAdminStudentDirectory,
  getGuardians,
  provisionAllGuardianLogins,
  provisionGuardianLogin,
  resendGuardianInvite,
  setGuardianChildren,
  updateGuardian,
} from "@/lib/api";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SearchInput,
} from "@/components/ui";

export default function ParentsPage() {
  const [rows, setRows] = useState<GuardianRow[] | null>(null);
  const [students, setStudents] = useState<AdminStudentDirectoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    relation: "",
    studentIds: [] as string[],
  });
  const [editing, setEditing] = useState<{
    id: string;
    fullName: string;
    email: string;
    hadEmail: boolean;
    phone: string;
    address: string;
    studentIds: string[];
  } | null>(null);
  const [removing, setRemoving] = useState<GuardianRow | null>(null);
  const [listQuery, setListQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<
    GuardianProvisionedLogin[] | null
  >(null);

  const load = useCallback(() => {
    getGuardians()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    getAdminStudentDirectory()
      .then(setStudents)
      .catch(() => setStudents([]));
  }, [load]);

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

  const visible = useMemo(() => {
    const needle = listQuery.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter(
      (g) =>
        g.name.toLowerCase().includes(needle) ||
        (g.email ?? "").toLowerCase().includes(needle) ||
        (g.phone ?? "").toLowerCase().includes(needle) ||
        g.children.some(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            c.studentNo.toLowerCase().includes(needle),
        ),
    );
  }, [rows, listQuery]);

  const valid = form.fullName.trim() && form.studentIds.length > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createGuardian({
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        studentIds: form.studentIds,
        relation: form.relation.trim() || undefined,
      });
      setNote(
        created.inviteDelivery === "sent"
          ? `Parent account created for ${form.fullName.trim()} · ID ${created.id}. The password-setup email was sent to ${created.email}.`
          : created.inviteDelivery === "not_needed"
            ? `${form.fullName.trim()} was linked to the selected student account(s). Their existing parent login remains active.`
            : created.inviteDelivery === "not_requested"
              ? `${form.fullName.trim()} was created as a contact-only parent. Add an email before creating a login.`
              : `Parent account created for ${form.fullName.trim()} · ID ${created.id}, but email delivery was not confirmed. Use Resend invite to try again and retrieve the setup link.`,
      );
      setAdding(false);
      setForm({
        fullName: "",
        email: "",
        phone: "",
        address: "",
        relation: "",
        studentIds: [],
      });
      load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create the parent account.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (
      !editing ||
      !editing.fullName.trim() ||
      (editing.hadEmail && !editing.email.trim())
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateGuardian(editing.id, {
        fullName: editing.fullName.trim(),
        email: editing.email.trim() || undefined,
        phone: editing.phone.trim() || null,
        address: editing.address.trim() || null,
      });
      await setGuardianChildren(editing.id, editing.studentIds);
      if (updated.inviteDelivery === "sent") {
        setNote(
          `Parent updated. The previous setup link was invalidated and a new one was sent to ${updated.email}.`,
        );
      } else if (updated.inviteDelivery === "not_sent") {
        setNote(
          `Parent updated and the previous setup link was invalidated, but delivery to ${updated.email} was not confirmed. Use Resend invite to retrieve a replacement link.`,
        );
      } else {
        setNote("Parent account updated.");
      }
      setEditing(null);
      load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the parent account.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await deleteGuardian(removing.id);
      setRemoving(null);
      load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not delete the parent account.",
      );
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  async function resend(guardian: Pick<GuardianRow, "id" | "email">) {
    if (!guardian.email) return;
    try {
      const result = await resendGuardianInvite(guardian.id);
      setNote(
        result.inviteDelivery === "sent"
          ? `Invitation sent to ${guardian.email}.`
          : `Email delivery was not confirmed. Give the guardian this one-time setup link securely: ${result.inviteLink}`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not resend the invitation.",
      );
    }
  }

  async function provisionOne(id: string) {
    setProvisioning(id);
    setError(null);
    try {
      const credential = await provisionGuardianLogin(id);
      setCredentials([credential]);
      load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not generate the parent login.",
      );
    } finally {
      setProvisioning(null);
    }
  }

  async function provisionAll() {
    setProvisioning("all");
    setError(null);
    try {
      const result = await provisionAllGuardianLogins();
      if (result.credentials.length > 0) {
        setCredentials(result.credentials);
      } else {
        setNote("Every parent already has a login.");
      }
      load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not generate parent logins.",
      );
    } finally {
      setProvisioning(null);
    }
  }

  const missingLogins = (rows ?? []).filter(
    (row) => row.email && !row.hasLogin,
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Parents"
        subtitle="Guardian accounts and the students each may follow. Guardians never self-register."
        actions={
          <>
            <SearchInput
              value={listQuery}
              onChange={setListQuery}
              placeholder="Filter parents or students…"
              width={260}
            />
            {missingLogins > 0 && (
              <Button
                icon={<KeyRound size={14} />}
                onClick={provisionAll}
                disabled={provisioning !== null}
              >
                {provisioning === "all"
                  ? "Generating…"
                  : `Generate ${missingLogins} login${missingLogins === 1 ? "" : "s"}`}
              </Button>
            )}
            <Button variant="primary" onClick={() => setAdding(true)}>
              New parent
            </Button>
          </>
        }
      />

      {error && (
        <p className="card" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {note && (
        <div
          className="card"
          style={{
            color: "var(--success-500)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <span>{note}</span>
          <IconButton label="Dismiss notice" onClick={() => setNote(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState
          title="No parent accounts yet"
          note="Create one to give a guardian read access to their child's record."
        />
      )}

      {rows && rows.length > 0 && visible.length === 0 && (
        <EmptyState title="No parents match" />
      )}

      {visible.length > 0 && (
        <Card pad={false}>
          <table>
            <thead>
              <tr>
                <th>Parent</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Assigned students</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => (
                <tr key={g.id} className="sis-row">
                  <td>
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 9 }}
                    >
                      <Avatar name={g.name} size={28} />
                      <span
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          lineHeight: 1.3,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{g.name}</span>
                        <span
                          className="muted"
                          style={{
                            fontSize: 11.5,
                            fontFamily: "var(--font-mono, monospace)",
                          }}
                        >
                          {g.id}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <div className="muted">{g.email ?? "No email"}</div>
                    {g.phone && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {g.phone}
                      </div>
                    )}
                    {g.address && (
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {g.address}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge
                      tone={
                        g.status === "active"
                          ? "success"
                          : g.status === "contact-only"
                            ? "warning"
                            : g.status === "invited" ||
                                g.status === "not-provisioned"
                              ? "warning"
                              : "error"
                      }
                    >
                      {g.status === "not-provisioned"
                        ? "Needs login"
                        : g.status === "contact-only"
                          ? "Contact only"
                          : g.status === "invite-expired"
                            ? "Invite expired"
                            : g.status}
                    </Badge>
                  </td>
                  <td>
                    {g.children.map((c) => (
                      <div key={c.studentId} style={{ fontSize: 12.5 }}>
                        {c.name} <span className="muted">({c.studentNo})</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <span
                      style={{
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      {g.email && g.status !== "active" && (
                        <Button
                          size="sm"
                          icon={<Mail size={12} />}
                          onClick={() => resend(g)}
                        >
                          Resend invite
                        </Button>
                      )}
                      {g.email && (
                        <Button
                          size="sm"
                          icon={<KeyRound size={12} />}
                          onClick={() => provisionOne(g.id)}
                          disabled={provisioning !== null}
                        >
                          {provisioning === g.id
                            ? "Generating…"
                            : g.hasLogin
                              ? "Reset password"
                              : "Generate login"}
                        </Button>
                      )}
                      <IconButton
                        label="Edit parent"
                        onClick={() =>
                          setEditing({
                            id: g.id,
                            fullName: g.name,
                            email: g.email ?? "",
                            hadEmail: g.email !== null,
                            phone: g.phone ?? "",
                            address: g.address ?? "",
                            studentIds: g.children.map((c) => c.studentId),
                          })
                        }
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        label="Delete parent"
                        tone="danger"
                        onClick={() => setRemoving(g)}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {adding && (
        <Modal
          open
          onClose={() => setAdding(false)}
          title="New parent account"
          width={560}
          footer={
            <>
              <Button onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="navy" onClick={submit} disabled={busy || !valid}>
                {busy
                  ? "Creating…"
                  : form.email.trim()
                    ? "Create & send invite"
                    : "Create contact"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Full name">
              <Input
                value={form.fullName}
                onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
              />
            </Field>
            <Field
              label="Email (optional)"
              hint="Without an email, this remains a contact-only parent with no login."
            >
              <Input
                value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                type="email"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
              />
            </Field>
            <Field
              label="Relationship"
              hint="Optional, e.g. Father, Mother, Guardian."
            >
              <Input
                value={form.relation}
                onChange={(v) => setForm((f) => ({ ...f, relation: v }))}
              />
            </Field>
            <ChildChecklist
              students={students}
              selected={form.studentIds}
              onToggle={(id) =>
                setForm((f) => ({
                  ...f,
                  studentIds: toggleId(f.studentIds, id),
                }))
              }
            />
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="Edit parent"
          width={560}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="navy"
                onClick={saveEdit}
                disabled={
                  busy ||
                  !editing.fullName.trim() ||
                  (editing.hadEmail && !editing.email.trim())
                }
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Full name">
              <Input
                value={editing.fullName}
                onChange={(v) =>
                  setEditing((e) => (e ? { ...e, fullName: v } : e))
                }
              />
            </Field>
            <Field
              label={editing.hadEmail ? "Email" : "Email (optional)"}
              hint={
                editing.hadEmail
                  ? "An established login email cannot be cleared here."
                  : "Add an email before sending an invitation or creating a login."
              }
            >
              <Input
                type="email"
                value={editing.email}
                onChange={(v) =>
                  setEditing((e) => (e ? { ...e, email: v } : e))
                }
              />
            </Field>
            <Field label="Phone">
              <Input
                value={editing.phone}
                onChange={(v) =>
                  setEditing((e) => (e ? { ...e, phone: v } : e))
                }
              />
            </Field>
            <Field label="Address">
              <Input
                value={editing.address}
                onChange={(v) =>
                  setEditing((e) => (e ? { ...e, address: v } : e))
                }
              />
            </Field>
            <ChildChecklist
              students={students}
              selected={editing.studentIds}
              onToggle={(id) =>
                setEditing((e) =>
                  e ? { ...e, studentIds: toggleId(e.studentIds, id) } : e,
                )
              }
            />
          </div>
        </Modal>
      )}

      {removing && (
        <Modal
          open
          onClose={() => setRemoving(null)}
          title="Delete parent"
          width={480}
          footer={
            <>
              <Button onClick={() => setRemoving(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={remove} disabled={busy}>
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Delete the guardian account for <strong>{removing.name}</strong> (
            {removing.email ?? "no email"})? This revokes their access to the
            assigned student record(s). This cannot be undone.
          </p>
        </Modal>
      )}

      {credentials && (
        <GuardianCredentialsModal
          credentials={credentials}
          onClose={() => setCredentials(null)}
        />
      )}
    </>
  );
}

function GuardianCredentialsModal({
  credentials,
  onClose,
}: {
  credentials: GuardianProvisionedLogin[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const bulk = credentials.length > 1;

  function copy() {
    const credential = credentials[0];
    if (!credential) return;
    navigator.clipboard
      ?.writeText(`${credential.email}\n${credential.tempPassword}`)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      });
  }

  function downloadCsv() {
    const body = credentials
      .map((credential) =>
        [credential.name, credential.email, credential.tempPassword]
          .map((value) => `"${value.replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`name,email,tempPassword\n${body}\n`], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daust-parent-logins-${credentials.length}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        bulk ? `${credentials.length} logins generated` : "Login generated"
      }
      width={bulk ? 680 : 480}
      footer={
        <>
          {bulk && (
            <Button icon={<Download size={14} />} onClick={downloadCsv}>
              Download CSV
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            padding: "9px 12px",
            borderRadius: "var(--radius-md)",
            background: "var(--warning-50, #fff7e8)",
            color: "var(--fg2)",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          Copy these credentials now. Passwords are shown once, are never stored
          in plain text or emailed, and must be changed on first login.
        </div>
        {bulk ? (
          <div style={{ maxHeight: 340, overflow: "auto", fontSize: 12.5 }}>
            {credentials.map((credential) => (
              <div
                key={credential.guardianId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.3fr 1fr",
                  minWidth: 540,
                  gap: 8,
                  padding: "7px 0",
                  borderBottom: "1px solid var(--border)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                <span>{credential.name}</span>
                <span>{credential.email}</span>
                <strong>{credential.tempPassword}</strong>
              </div>
            ))}
          </div>
        ) : (
          <>
            <Field label="Name">
              <div>{credentials[0]!.name}</div>
            </Field>
            <Field label="Email (login)">
              <div style={{ fontFamily: "ui-monospace, monospace" }}>
                {credentials[0]!.email}
              </div>
            </Field>
            <Field label="Temporary password">
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                {credentials[0]!.tempPassword}
              </div>
            </Field>
            <Button icon={<Copy size={14} />} onClick={copy}>
              {copied ? "Copied" : "Copy email + password"}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

function ChildChecklist({
  students,
  selected,
  onToggle,
}: {
  students: AdminStudentDirectoryRow[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const options = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n
      ? students.filter(
          (s) =>
            s.name.toLowerCase().includes(n) ||
            s.studentNo.toLowerCase().includes(n) ||
            s.program.toLowerCase().includes(n),
        )
      : students;
    return list.slice(0, 60);
  }, [students, q]);

  return (
    <>
      <Field label={`Assign students (${selected.length} selected)`}>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Filter students by name, ID or program…"
        />
      </Field>
      <div
        style={{
          maxHeight: 280,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        {options.length === 0 && (
          <p className="muted" style={{ padding: 12, margin: 0, fontSize: 13 }}>
            No students match your filter.
          </p>
        )}
        {options.map((s) => {
          const checked = selected.includes(s.id);
          return (
            <label
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 12px",
                borderBottom: "1px solid var(--divider)",
                cursor: "pointer",
                background: checked ? "var(--accent-bg)" : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(s.id)}
              />
              <span style={{ fontSize: 13 }}>{s.name}</span>
              <span
                className="muted"
                style={{ fontSize: 12, marginLeft: "auto" }}
              >
                {s.studentNo} · {s.program}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}
