"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import type { AdminFacultyItem } from "@mydaust/shared";
import { slugify } from "@mydaust/shared";
import {
  type CreatedFaculty,
  type StaffMember,
  createFaculty,
  deleteFaculty,
  fileUrl,
  getFacultyList,
  getStaff,
  setFacultyVisibility,
  updateFacultyProfile,
  uploadFile,
} from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Toggle,
} from "@/components/ui";

interface Form {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  dept: string;
  bio: string;
  interests: string; // comma-separated
  scholar: string;
  photoUrl: string;
}

const taStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--fg1)",
  fontSize: 13.5,
  fontFamily: "var(--font-body)",
  resize: "vertical",
  lineHeight: 1.5,
};

/** The public site origin, so the "View public page" link points at the right host. */
function vitrineOrigin(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.host;
  if (h.startsWith("localhost")) return "http://localhost:3001";
  if (h.includes("azt.dev")) return "https://daust.azt.dev";
  return "https://daust.net";
}

function publicFacultyUrl(a: AdminFacultyItem): string {
  // The public site is a static export; deep links ride a root query param.
  return `${vitrineOrigin()}/?faculty=${slugify(`${a.firstName} ${a.lastName}`)}`;
}

function toForm(a: AdminFacultyItem): Form {
  const p = a.profile;
  return {
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
    title: p?.title ?? "",
    dept: p?.dept ?? "",
    bio: p?.bio ?? "",
    interests: p?.interests.join(", ") ?? "",
    scholar: p?.scholar ?? "",
    photoUrl: p?.photoUrl ?? "",
  };
}

function fieldLabel(text: string) {
  return (
    <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>
      {text}
    </div>
  );
}

export default function DirectoryManager() {
  const [list, setList] = useState<AdminFacultyItem[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminFacultyItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [creds, setCreds] = useState<
    (CreatedFaculty & { name: string }) | null
  >(null);

  const load = () =>
    Promise.all([getFacultyList(), getStaff()])
      .then(([f, s]) => {
        setList(f);
        setStaff(s);
      })
      .catch((e) =>
        setErr(e instanceof Error ? e.message : "Failed to load directory."),
      );
  useEffect(() => {
    load();
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  function openEditor(a: AdminFacultyItem) {
    setErr(null);
    setEditId(a.id);
    setForm(toForm(a));
  }

  async function toggleVisible(a: AdminFacultyItem, visible: boolean) {
    setToggling(a.id);
    setErr(null);
    try {
      await setFacultyVisibility(a.id, visible);
      setList(
        (ls) =>
          ls?.map((x) =>
            x.id === a.id ? { ...x, publicProfile: visible } : x,
          ) ?? null,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update visibility.");
    } finally {
      setToggling(null);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const { url } = await uploadFile(file);
      set("photoUrl", url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form) return;
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setErr("First name, last name and email are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await updateFacultyProfile(editId!, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        title: form.title.trim() || null,
        dept: form.dept.trim() || null,
        bio: form.bio.trim() || null,
        interests: form.interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        scholar: form.scholar.trim() || null,
        photoUrl: form.photoUrl.trim() || null,
      });
      setEditId(null);
      setForm(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFaculty() {
    if (!deleteTarget) return;
    setDeleting(true);
    setErr(null);
    try {
      await deleteFaculty(deleteTarget.id);
      setDeleteTarget(null);
      setEditId(null);
      setForm(null);
      await load();
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Could not delete faculty member.",
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  if (err && !list)
    return (
      <Card>
        <div style={{ color: "var(--error-500)" }}>{err}</div>
      </Card>
    );
  if (!list)
    return <div style={{ color: "var(--fg3)", padding: 20 }}>Loading…</div>;

  const otherStaff = (staff ?? []).filter((s) => s.kind !== "faculty");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div
            style={{
              flex: 1,
              fontSize: 13.5,
              color: "var(--fg2)",
              lineHeight: 1.6,
            }}
          >
            The directory is the single source for who appears on the public
            site. Add faculty here, edit their public profile and photo, and use
            the toggle to publish or unpublish them. Published professors get a
            shareable page at <code>/directory/faculty/…</code>.
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--fg3)" }}>
              {list.filter((a) => a.publicProfile).length} of {list.length}{" "}
              faculty visible on the site.
            </div>
          </div>
          <Button
            variant="primary"
            icon={<UserPlus size={15} />}
            onClick={() => {
              setErr(null);
              setAddOpen(true);
            }}
          >
            Add faculty
          </Button>
        </div>
      </Card>

      {err && (
        <div style={{ color: "var(--error-500)", fontSize: 13 }}>{err}</div>
      )}

      <SectionLabel>Faculty</SectionLabel>
      {list.length === 0 && (
        <Card>
          <div
            style={{
              color: "var(--fg3)",
              padding: "20px 0",
              textAlign: "center",
            }}
          >
            No faculty yet. Use “Add faculty” to create the first record. The
            public Faculty page falls back to its built-in list until someone is
            toggled on.
          </div>
        </Card>
      )}
      {list.map((a) => {
        const isEditing = editId === a.id;
        return (
          <Card key={a.id}>
            {!isEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                    background: "var(--daust-navy)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {a.profile?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fileUrl(a.profile.photoUrl)}
                      alt={`${a.firstName} ${a.lastName}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span
                      style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}
                    >
                      {`${a.firstName.charAt(0)}${a.lastName.charAt(0)}`.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong style={{ fontSize: 14.5 }}>
                      {a.firstName} {a.lastName}
                    </strong>
                    {a.publicProfile ? (
                      <Badge tone="success">Public</Badge>
                    ) : (
                      <Badge tone="neutral">Private</Badge>
                    )}
                    {a.publicProfile && (
                      <a
                        href={publicFacultyUrl(a)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: "var(--daust-navy)",
                          fontWeight: 600,
                        }}
                      >
                        <ExternalLink size={12} /> View public page
                      </a>
                    )}
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2 }}
                  >
                    {a.email}
                  </div>
                  {a.profile && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--fg2)",
                        marginTop: 4,
                      }}
                    >
                      {[a.profile.title, a.profile.dept]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  )}
                </div>
                <Toggle
                  checked={a.publicProfile}
                  disabled={toggling === a.id}
                  onChange={(v) => toggleVisible(a, v)}
                  label={toggling === a.id ? "Saving…" : "Public on site"}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={14} />}
                  onClick={() => openEditor(a)}
                >
                  Edit
                </Button>
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Pencil size={15} />
                  <strong style={{ fontSize: 14.5 }}>
                    Edit profile — {a.firstName} {a.lastName}
                  </strong>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: "var(--fg3)",
                    }}
                  >
                    {a.email}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 18 }}>
                  <div style={{ width: 96, flexShrink: 0 }}>
                    {form?.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fileUrl(form.photoUrl)}
                        alt="profile"
                        style={{
                          width: 96,
                          height: 96,
                          objectFit: "cover",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: "var(--radius-md)",
                          border: "1px dashed var(--border)",
                          background: "var(--surface-2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--fg3)",
                          fontSize: 12,
                        }}
                      >
                        No photo
                      </div>
                    )}
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--daust-navy)",
                        cursor: "pointer",
                        marginTop: 8,
                      }}
                    >
                      <Upload size={13} />
                      {uploading ? "Uploading…" : "Photo"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => onPhoto(e.target.files?.[0])}
                        disabled={uploading}
                      />
                    </label>
                    {form?.photoUrl && (
                      <button
                        onClick={() => set("photoUrl", "")}
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          color: "var(--fg3)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px 0 0",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      {fieldLabel("First name")}
                      <Input
                        value={form?.firstName ?? ""}
                        onChange={(v) => set("firstName", v)}
                      />
                    </div>
                    <div>
                      {fieldLabel("Last name")}
                      <Input
                        value={form?.lastName ?? ""}
                        onChange={(v) => set("lastName", v)}
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      {fieldLabel("Email / sign-in identity")}
                      <Input
                        value={form?.email ?? ""}
                        onChange={(v) => set("email", v)}
                        type="email"
                        inputMode="email"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  {fieldLabel(
                    "Title (e.g. Associate Professor of Mechanical Engineering)",
                  )}
                  <Input
                    value={form?.title ?? ""}
                    onChange={(v) => set("title", v)}
                  />
                </div>
                <div>
                  {fieldLabel("Department / research center")}
                  <Input
                    value={form?.dept ?? ""}
                    onChange={(v) => set("dept", v)}
                  />
                </div>
                <div>
                  {fieldLabel("Research interests (comma-separated)")}
                  <textarea
                    rows={2}
                    value={form?.interests ?? ""}
                    onChange={(e) => set("interests", e.target.value)}
                    style={taStyle}
                  />
                </div>
                <div>
                  {fieldLabel("Bio")}
                  <textarea
                    rows={4}
                    value={form?.bio ?? ""}
                    onChange={(e) => set("bio", e.target.value)}
                    style={taStyle}
                  />
                </div>
                <div>
                  {fieldLabel("Publications / research profile link (URL)")}
                  <Input
                    value={form?.scholar ?? ""}
                    onChange={(v) => set("scholar", v)}
                    placeholder="https://…"
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Toggle
                    checked={a.publicProfile}
                    disabled={toggling === a.id}
                    onChange={(v) => toggleVisible(a, v)}
                    label={toggling === a.id ? "Saving…" : "Public on site"}
                  />
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: "var(--fg3)",
                    }}
                  >
                    <Globe size={12} style={{ verticalAlign: "-2px" }} />{" "}
                    Toggling is saved instantly
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Button
                    variant="primary"
                    icon={<Check size={15} />}
                    onClick={save}
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Save profile"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditId(null);
                      setForm(null);
                      setErr(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    icon={<Trash2 size={14} />}
                    onClick={() => setDeleteTarget(a)}
                    disabled={a.assignedSectionCount > 0}
                    title={
                      a.assignedSectionCount > 0
                        ? "Reassign this instructor's sections before deleting."
                        : "Delete this unused faculty record"
                    }
                  >
                    Delete faculty
                  </Button>
                </div>
                {a.assignedSectionCount > 0 && (
                  <div style={{ fontSize: 12, color: "var(--fg3)" }}>
                    Deletion is locked while this instructor is assigned to{" "}
                    {a.assignedSectionCount} section
                    {a.assignedSectionCount === 1 ? "" : "s"}.
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <SectionLabel>Staff & administration</SectionLabel>
      <Card>
        <div style={{ fontSize: 12.5, color: "var(--fg3)", marginBottom: 10 }}>
          Non-teaching accounts. Manage their roles under Roles &amp;
          Permissions; they do not appear on the public site.
        </div>
        {otherStaff.length === 0 ? (
          <div style={{ color: "var(--fg3)", padding: "8px 0" }}>
            No staff accounts.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {otherStaff.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5 }}>{s.name}</strong>
                  <div style={{ fontSize: 12, color: "var(--fg3)" }}>
                    {s.email}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  {s.roles.map((r) => (
                    <Badge key={r} tone="neutral">
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AddFacultyModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(c) => {
          setAddOpen(false);
          if (c.tempPassword) setCreds(c);
          load();
        }}
      />
      {creds && (
        <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
      )}
      <Modal
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete faculty record?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={removeFaculty}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle
            size={20}
            color="var(--error-500)"
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <div
            style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fg2)" }}
          >
            This permanently removes{" "}
            <strong>
              {deleteTarget?.firstName} {deleteTarget?.lastName}
            </strong>{" "}
            ({deleteTarget?.email}). Only unused records can be deleted;
            academic or communication history is always preserved.
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: "var(--fg3)",
        marginTop: 6,
      }}
    >
      {children}
    </div>
  );
}

function AddFacultyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: CreatedFaculty & { name: string }) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [provisionLogin, setProvisionLogin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFirstName("");
      setLastName("");
      setEmail("");
      setProvisionLogin(true);
      setErr(null);
    }
  }, [open]);

  async function submit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErr("First name, last name and email are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const c = await createFaculty({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        provisionLogin,
      });
      onCreated({ ...c, name: `${firstName.trim()} ${lastName.trim()}` });
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Could not create faculty member.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add faculty member"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && (
          <div style={{ color: "var(--error-500)", fontSize: 13 }}>{err}</div>
        )}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <Field label="First name">
            <Input value={firstName} onChange={setFirstName} />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={setLastName} />
          </Field>
        </div>
        <Field
          label="Email"
          hint="Their institutional email — becomes the sign-in identity."
        >
          <Input
            value={email}
            onChange={setEmail}
            placeholder="name@daust.org"
          />
        </Field>
        <Toggle
          checked={provisionLogin}
          onChange={setProvisionLogin}
          label="Create a login now (a temporary password is shown once)"
        />
        <div style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.5 }}>
          You can fill in the public profile (title, bio, photo) and publish
          them after creating the record.
        </div>
      </div>
    </Modal>
  );
}

function CredentialsModal({
  creds,
  onClose,
}: {
  creds: CreatedFaculty & { name: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard
      ?.writeText(`${creds.email}\n${creds.tempPassword ?? ""}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Login created"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>
          Give <strong>{creds.name}</strong> these credentials now — the
          password is shown once, never stored or emailed, and must be changed
          on first login.
        </div>
        <Field label="Email">
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 14 }}>
            {creds.email}
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
            {creds.tempPassword}
          </div>
        </Field>
        <Button variant="secondary" icon={<Copy size={14} />} onClick={copy}>
          {copied ? "Copied" : "Copy email + password"}
        </Button>
      </div>
    </Modal>
  );
}
