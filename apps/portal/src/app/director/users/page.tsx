"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldOff, ShieldCheck } from "lucide-react";
import {
  type ManagedUser,
  type Me,
  createManagedUser,
  getMe,
  listManagedUsers,
  restoreManagedUser,
  resetManagedUserPassword,
  suspendManagedUser,
  updateUserRoles,
} from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
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
  Select,
} from "@/components/ui";
import { CredentialsModal } from "./CredentialsModal";

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  parent: "Parent",
  faculty: "Faculty",
  registrar: "Registrar",
  bursar: "Bursar",
  hr: "HR",
  it_admin: "IT Admin",
  communications: "Communications",
  admin: "Admin",
};

/**
 * Roles this screen assigns. student and parent are absent on purpose: both need a backing
 * record the API refuses to invent, so they are granted by creating the student or linking
 * the guardian, not by ticking a box here.
 */
const ASSIGNABLE = [
  "faculty",
  "registrar",
  "bursar",
  "hr",
  "it_admin",
  "communications",
  "admin",
];

const KIND_LABEL: Record<string, string> = {
  faculty: "Faculty",
  staff: "Staff",
  parent: "Parent",
  student: "Student",
};

const PAGE_SIZE = 25;

export default function UsersPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<ManagedUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [confirming, setConfirming] = useState<ManagedUser | null>(null);
  const [credentials, setCredentials] = useState<{
    name: string;
    email: string;
    tempPassword: string;
  } | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
  }, []);

  const load = useCallback(() => {
    const controller = new AbortController();
    listManagedUsers({ q, kind, role, status, page, pageSize: PAGE_SIZE })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [q, kind, role, status, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // Reset to the first page whenever a filter narrows the set under our feet.
  useEffect(() => setPage(1), [q, kind, role, status]);

  const isAdmin = me?.roles.includes("admin") ?? false;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        subtitle="Every account, the roles it holds, and whether it can sign in."
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />

      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <SearchInput value={q} onChange={setQ} placeholder="Name, address or student ID…" />
          <Select
            ariaLabel="Filter by type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "", label: "All types" },
              { value: "staff", label: "Staff" },
              { value: "faculty", label: "Faculty" },
              { value: "student", label: "Student" },
              { value: "parent", label: "Parent" },
            ]}
          />
          <Select
            ariaLabel="Filter by role"
            value={role}
            onChange={setRole}
            options={[
              { value: "", label: "All roles" },
              ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "Active and suspended" },
              { value: "active", label: "Active only" },
              { value: "suspended", label: "Suspended only" },
            ]}
          />
        </div>
      </Card>

      {error && (
        <p className="card" style={{ color: "var(--danger)", marginTop: 14 }}>
          {error}
        </p>
      )}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <div style={{ marginTop: 14 }}>
          <EmptyState title="No accounts match these filters" />
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Card pad={false}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Login address</th>
                    <th>Type</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="sis-row">
                      <td style={{ fontWeight: 600 }}>
                        {u.name}
                        {u.studentNo && (
                          <span className="muted" style={{ fontWeight: 400 }}> · {u.studentNo}</span>
                        )}
                      </td>
                      <td className="muted">{u.email ?? "—"}</td>
                      <td>{KIND_LABEL[u.kind] ?? u.kind}</td>
                      <td>
                        <RoleCell roles={u.roles} />
                      </td>
                      <td>
                        <StatusCell user={u} />
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {u.id !== me?.personId && (
                          <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                            <IconButton label={`Edit roles for ${u.name}`} onClick={() => setEditing(u)}>
                              <Pencil size={15} />
                            </IconButton>
                            <IconButton
                              label={`Reset the password for ${u.name}`}
                              onClick={() =>
                                resetManagedUserPassword(u.id)
                                  .then((r) =>
                                    setCredentials({
                                      name: r.name,
                                      email: r.email,
                                      tempPassword: r.tempPassword,
                                    }),
                                  )
                                  .catch((e: Error) => setError(e.message))
                              }
                            >
                              <KeyRound size={15} />
                            </IconButton>
                            <IconButton
                              label={
                                u.status === "suspended"
                                  ? `Restore ${u.name}`
                                  : `Suspend ${u.name}`
                              }
                              onClick={() =>
                                u.status === "suspended"
                                  ? restoreManagedUser(u.id)
                                      .then(load)
                                      .catch((e: Error) => setError(e.message))
                                  : setConfirming(u)
                              }
                            >
                              {u.status === "suspended" ? (
                                <ShieldCheck size={15} />
                              ) : (
                                <ShieldOff size={15} />
                              )}
                            </IconButton>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div
            aria-live="polite"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 10, flexWrap: "wrap" }}
          >
            <span className="muted" style={{ fontSize: 12.5 }}>
              {total} account{total === 1 ? "" : "s"} · page {page} of {pages}
            </span>
            <span style={{ display: "inline-flex", gap: 8 }}>
              <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </span>
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14, maxWidth: 640 }}>
        A login address is a sign-in identifier, not a mailbox — mail sent to one does not
        arrive. Suspending an account ends its open sessions immediately and blocks sign-in;
        it does not remove the person from rosters or course assignments.
        {!isAdmin && " Only an administrator can assign or remove the Admin role."}
      </p>

      {creating && (
        <CreateUserModal
          canAssignAdmin={isAdmin}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            if (c) setCredentials(c);
            load();
          }}
        />
      )}

      {editing && (
        <RolesModal
          user={editing}
          canAssignAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={`Suspend ${confirming.name}?`}
          message={
            <>
              They will be signed out immediately and cannot sign in again until restored.
              Their record, grades and history are kept.
            </>
          }
          confirmLabel="Suspend"
          onConfirm={async () => {
            await suspendManagedUser(confirming.id);
            setConfirming(null);
            load();
          }}
          onClose={() => setConfirming(null)}
        />
      )}

      {credentials && (
        <CredentialsModal
          name={credentials.name}
          email={credentials.email}
          tempPassword={credentials.tempPassword}
          onClose={() => setCredentials(null)}
        />
      )}
    </>
  );
}

/** A roleless account still signs in, so it is called out rather than shown as a dash. */
function RoleCell({ roles }: { roles: string[] }) {
  if (roles.length === 0) {
    return <Badge tone="warning">No role — can sign in, sees nothing</Badge>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {roles.map((r) => (
        <Badge key={r} tone="navy">
          {ROLE_LABEL[r] ?? r}
        </Badge>
      ))}
    </span>
  );
}

function StatusCell({ user }: { user: ManagedUser }) {
  if (user.status === "suspended") return <Badge tone="error">Suspended</Badge>;
  if (!user.hasLogin) return <Badge tone="neutral">No login</Badge>;
  if (user.mustChangePassword) return <Badge tone="warning">Must change password</Badge>;
  return <Badge tone="success">Active</Badge>;
}

function RolesModal({
  user,
  canAssignAdmin,
  onClose,
  onSaved,
}: {
  user: ManagedUser;
  canAssignAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // student and parent are not assignable here; keep whatever the person already holds.
  const kept = useMemo(
    () => user.roles.filter((r) => !ASSIGNABLE.includes(r)),
    [user.roles],
  );

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await updateUserRoles(
        user.id,
        Array.from(new Set([...kept, ...roles.filter((r) => ASSIGNABLE.includes(r))])),
      );
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update roles.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Roles — ${user.name}`}
      width={460}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{user.email}</p>
        {kept.length > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Also holds {kept.map((r) => ROLE_LABEL[r] ?? r).join(", ")}, which is granted by
            their record rather than here.
          </p>
        )}
        <RoleChecklist
          roles={roles}
          canAssignAdmin={canAssignAdmin}
          onToggle={(r) =>
            setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))
          }
        />
      </div>
    </Modal>
  );
}

function RoleChecklist({
  roles,
  canAssignAdmin,
  onToggle,
}: {
  roles: string[];
  canAssignAdmin: boolean;
  onToggle: (role: string) => void;
}) {
  return (
    <>
      {ASSIGNABLE.map((r) => {
        const locked = r === "admin" && !canAssignAdmin;
        return (
          <label
            key={r}
            title={locked ? "Only an administrator can assign the Admin role" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.55 : 1,
              background: roles.includes(r) ? "var(--accent-bg)" : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={roles.includes(r)}
              disabled={locked}
              onChange={() => onToggle(r)}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ROLE_LABEL[r]}</span>
          </label>
        );
      })}
    </>
  );
}

function CreateUserModal({
  canAssignAdmin,
  onClose,
  onCreated,
}: {
  canAssignAdmin: boolean;
  onClose: () => void;
  onCreated: (credentials: { name: string; email: string; tempPassword: string } | null) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailLocal, setEmailLocal] = useState("");
  const [emailDomain, setEmailDomain] = useState("daust.org");
  const [kind, setKind] = useState("staff");
  const [roles, setRoles] = useState<string[]>([]);
  const [provisionLogin, setProvisionLogin] = useState(true);
  const [studentNo, setStudentNo] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Students live on mydaust.com, matching the existing cohort; the API enforces this too.
  const isStudent = kind === "student";
  useEffect(() => {
    if (isStudent) setEmailDomain("mydaust.com");
  }, [isStudent]);

  // Keep suggesting an address from the name until the administrator edits it themselves.
  // Gating on "emailLocal is empty" instead froze the suggestion on the first keystroke of
  // the surname, so "Fatou Sarr" was offered fatou.s.
  const [addressEdited, setAddressEdited] = useState(false);
  useEffect(() => {
    if (addressEdited) return;
    const clean = (v: string) =>
      v.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "");
    const suggestion = [clean(firstName), clean(lastName)].filter(Boolean).join(".");
    setEmailLocal(suggestion);
  }, [firstName, lastName, addressEdited]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const created = await createManagedUser({
        firstName,
        lastName,
        emailLocal,
        emailDomain,
        kind,
        roles: isStudent ? [] : roles,
        provisionLogin,
        ...(isStudent
          ? { student: { studentNo, programCode: programCode || null } }
          : {}),
      });
      onCreated(
        created.tempPassword
          ? {
              name: `${firstName} ${lastName}`.trim(),
              email: created.email,
              tempPassword: created.tempPassword,
            }
          : null,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the account.");
      setBusy(false);
    }
  }

  const ready =
    firstName.trim() && lastName.trim() && emailLocal.trim() && (!isStudent || studentNo.trim());

  return (
    <Modal
      open
      onClose={onClose}
      title="Add user"
      width={540}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || !ready}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="First name">
            <Input value={firstName} onChange={setFirstName} />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={setLastName} />
          </Field>
        </div>

        <Field
          label="Login address"
          hint="This is how they sign in. It is not a mailbox — mail sent to it does not arrive."
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input
              value={emailLocal}
              onChange={(v) => {
                setAddressEdited(true);
                setEmailLocal(v);
              }}
              placeholder="amadou.sy"
            />
            <span className="muted">@</span>
            <Select
              ariaLabel="Login domain"
              value={emailDomain}
              onChange={setEmailDomain}
              options={
                isStudent
                  ? [{ value: "mydaust.com", label: "mydaust.com" }]
                  : [
                      { value: "daust.org", label: "daust.org" },
                      { value: "mydaust.com", label: "mydaust.com" },
                    ]
              }
            />
          </div>
        </Field>

        <Field label="Type">
          <Select
            ariaLabel="Account type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "staff", label: "Staff" },
              { value: "faculty", label: "Faculty" },
              { value: "student", label: "Student" },
            ]}
          />
        </Field>

        {isStudent ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Student ID">
              <Input value={studentNo} onChange={setStudentNo} placeholder="DS2026001" />
            </Field>
            <Field label="Programme code" hint="Optional">
              <Input value={programCode} onChange={setProgramCode} placeholder="CSC" />
            </Field>
          </div>
        ) : kind === "faculty" ? (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Faculty accounts receive the Faculty role and a public profile that stays hidden
            until Communications publishes it.
          </p>
        ) : (
          <Field label="Roles" hint="Leave every box unticked to create an account with no access yet.">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <RoleChecklist
                roles={roles}
                canAssignAdmin={canAssignAdmin}
                onToggle={(r) =>
                  setRoles((cur) =>
                    cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r],
                  )
                }
              />
            </div>
          </Field>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={provisionLogin}
            onChange={() => setProvisionLogin((v) => !v)}
          />
          <span style={{ fontSize: 13.5 }}>
            Create a password now — shown once, on the next screen
          </span>
        </label>
      </div>
    </Modal>
  );
}
