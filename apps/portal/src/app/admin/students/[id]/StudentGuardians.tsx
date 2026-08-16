"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link2,
  Mail,
  Phone,
  ShieldCheck,
  Unlink,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  type GuardianRow,
  type StudentGuardianLink,
  createStudentGuardian,
  getGuardians,
  getStudentGuardians,
  linkStudentGuardian,
  unlinkStudentGuardian,
} from "@/lib/api";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  SearchInput,
} from "@/components/ui";

type RecordStatus = "pending_payment" | "active" | "archived";

const STATUS_META: Record<
  StudentGuardianLink["status"],
  { label: string; tone: "success" | "warning" | "error" }
> = {
  active: { label: "Login active", tone: "success" },
  "not-provisioned": { label: "No login yet", tone: "warning" },
  invited: { label: "Invite sent", tone: "warning" },
  "invite-expired": { label: "Invite expired", tone: "error" },
};

const EMPTY_CREATE_FORM = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  relation: "",
  sendInvite: false,
};

export function StudentGuardians({
  studentId,
  recordStatus,
}: {
  studentId: string;
  recordStatus: RecordStatus;
}) {
  const [links, setLinks] = useState<StudentGuardianLink[] | null>(null);
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [unlinking, setUnlinking] = useState<StudentGuardianLink | null>(null);
  const [selectedGuardianId, setSelectedGuardianId] = useState("");
  const [relation, setRelation] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY_CREATE_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [linked, allGuardians] = await Promise.all([
        getStudentGuardians(studentId),
        getGuardians(),
      ]);
      setLinks(linked);
      setGuardians(allGuardians);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load parent relationships.",
      );
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = useMemo(() => {
    const linkedIds = new Set((links ?? []).map((link) => link.id));
    const needle = query.trim().toLowerCase();
    return guardians.filter((guardian) => {
      if (linkedIds.has(guardian.id)) return false;
      if (!needle) return true;
      return (
        guardian.name.toLowerCase().includes(needle) ||
        guardian.email.toLowerCase().includes(needle) ||
        (guardian.phone ?? "").toLowerCase().includes(needle)
      );
    });
  }, [guardians, links, query]);

  const canAdd = recordStatus !== "archived";

  function closeLink() {
    if (busy) return;
    setLinkOpen(false);
    setSelectedGuardianId("");
    setRelation("");
    setQuery("");
  }

  function closeCreate() {
    if (busy) return;
    setCreateOpen(false);
    setForm(EMPTY_CREATE_FORM);
  }

  async function submitLink() {
    if (!selectedGuardianId) return;
    setBusy(true);
    setError(null);
    try {
      await linkStudentGuardian(studentId, {
        guardianId: selectedGuardianId,
        relation: relation.trim() || undefined,
      });
      setLinkOpen(false);
      setSelectedGuardianId("");
      setRelation("");
      setQuery("");
      setNotice(
        "Existing parent linked. Their other student links were unchanged.",
      );
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not link the parent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate() {
    if (!form.fullName.trim() || !form.email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createStudentGuardian(studentId, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        relation: form.relation.trim() || undefined,
        sendInvite: form.sendInvite,
      });
      setCreateOpen(false);
      setForm(EMPTY_CREATE_FORM);
      setNotice(
        result.inviteDelivery === "sent"
          ? "Parent created, linked, and sent a password-setup invitation."
          : result.inviteDelivery === "not_sent"
            ? "Parent created and linked, but invitation delivery was not confirmed. No password was generated."
            : "Parent created and linked. No login or invitation was created.",
      );
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create the parent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmUnlink() {
    if (!unlinking) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkStudentGuardian(studentId, unlinking.id);
      setUnlinking(null);
      setNotice(
        "Parent unlinked from this student. The parent account and other relationships remain intact.",
      );
      await load();
    } catch (unlinkError) {
      setError(
        unlinkError instanceof Error
          ? unlinkError.message
          : "Could not unlink the parent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UsersRound size={16} color="var(--accent)" />
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              Parents & guardians
            </h3>
          </div>
        }
      >
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 13.5 }}>
          These account relationships control which student records a parent can
          access. Changes are recorded in the audit log.
        </p>

        {canAdd && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            <Button
              size="sm"
              icon={<Link2 size={13} />}
              onClick={() => {
                setError(null);
                setLinkOpen(true);
              }}
            >
              Link existing
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<UserPlus size={13} />}
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
            >
              Create new
            </Button>
          </div>
        )}

        {recordStatus === "pending_payment" && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "11px 13px",
              marginBottom: 16,
              borderRadius: "var(--radius-md)",
              background: "var(--surface-2)",
              color: "var(--fg2)",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <ShieldCheck
              aria-hidden="true"
              size={16}
              color="var(--accent)"
              style={{ marginTop: 1, flexShrink: 0 }}
            />
            This student is awaiting payment. You may prepare parent links now,
            but parent access to the student record begins only after
            activation.
          </div>
        )}

        {recordStatus === "archived" && (
          <p className="muted" style={{ margin: "0 0 16px", fontSize: 12.5 }}>
            This student is archived. Existing access can be revoked, but new
            parent relationships cannot be added.
          </p>
        )}

        {error && (
          <div
            role="alert"
            style={{ color: "var(--danger)", fontSize: 13, marginBottom: 14 }}
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            style={{ color: "var(--success)", fontSize: 13, marginBottom: 14 }}
          >
            {notice}
          </div>
        )}

        {links === null ? (
          <p className="muted" style={{ margin: 0 }}>
            Loading parent relationships…
          </p>
        ) : links.length === 0 ? (
          <EmptyState
            icon={<UsersRound size={20} />}
            title="No parent or guardian is linked"
            note="Link an existing parent account or create a new profile."
          />
        ) : (
          <div>
            {links.map((guardian, index) => {
              const status = STATUS_META[guardian.status];
              return (
                <article
                  key={guardian.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 20,
                    alignItems: "center",
                    padding: "16px 0",
                    borderTop: index === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      minWidth: 0,
                      flex: "1 1 220px",
                    }}
                  >
                    <Avatar name={guardian.name} size={42} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 750, fontSize: 14.5 }}>
                        {guardian.name}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 7,
                          flexWrap: "wrap",
                          marginTop: 5,
                        }}
                      >
                        <Badge tone="neutral">
                          {guardian.relation?.trim() || "Parent or guardian"}
                        </Badge>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {guardian.hasLogin && guardian.mustChangePassword && (
                          <Badge tone="warning">Password change required</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "9px 22px",
                      fontSize: 13.5,
                      flex: "1 1 280px",
                    }}
                  >
                    <a
                      href={`mailto:${guardian.email}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        color: "var(--fg1)",
                        textDecoration: "none",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <Mail size={14} color="var(--daust-steel)" />
                      {guardian.email}
                    </a>
                    {guardian.phone ? (
                      <a
                        href={`tel:${guardian.phone}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          color: "var(--fg1)",
                          textDecoration: "none",
                        }}
                      >
                        <Phone size={14} color="var(--daust-steel)" />
                        {guardian.phone}
                      </a>
                    ) : null}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Unlink size={13} />}
                    onClick={() => {
                      setError(null);
                      setUnlinking(guardian);
                    }}
                  >
                    Unlink
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={linkOpen}
        onClose={closeLink}
        title="Link an existing parent"
        width={620}
        footer={
          <>
            <Button onClick={closeLink} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="navy"
              onClick={submitLink}
              disabled={busy || !selectedGuardianId}
            >
              {busy ? "Linking…" : "Link parent"}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16 }}>
          {error && (
            <div role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
              {error}
            </div>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            This adds access to this student only. Existing parent relationships
            and login credentials are not changed.
          </p>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search parents by name, email, or phone…"
            width="100%"
          />
          <div
            role="radiogroup"
            aria-label="Existing parent accounts"
            style={{
              maxHeight: 280,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {available.length === 0 ? (
              <EmptyState
                title={
                  query ? "No parent accounts match" : "No parents available"
                }
                note={
                  query
                    ? "Try another name, email, or phone number."
                    : "Every existing parent is already linked to this student."
                }
              />
            ) : (
              available.map((guardian, index) => (
                <label
                  key={guardian.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "11px 13px",
                    cursor: "pointer",
                    borderTop: index === 0 ? "none" : "1px solid var(--border)",
                    background:
                      selectedGuardianId === guardian.id
                        ? "var(--surface-2)"
                        : "var(--surface)",
                  }}
                >
                  <input
                    type="radio"
                    name="guardian"
                    value={guardian.id}
                    checked={selectedGuardianId === guardian.id}
                    onChange={() => setSelectedGuardianId(guardian.id)}
                  />
                  <Avatar name={guardian.name} size={34} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 700 }}>
                      {guardian.name}
                    </span>
                    <span
                      className="muted"
                      style={{
                        display: "block",
                        fontSize: 12,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {guardian.email}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <Field
            label="Relationship (optional)"
            hint="For example: Mother, Father, Sponsor, or Legal guardian."
          >
            <Input value={relation} onChange={setRelation} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="Create and link a parent"
        width={600}
        footer={
          <>
            <Button onClick={closeCreate} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="navy"
              onClick={submitCreate}
              disabled={busy || !form.fullName.trim() || !form.email.trim()}
            >
              {busy ? "Creating…" : "Create & link"}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          {error && (
            <div role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
              {error}
            </div>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Use this only when no parent account already exists for the email.
            Parent emails cannot overlap student, faculty, or staff accounts.
          </p>
          <Field label="Full name">
            <Input
              value={form.fullName}
              onChange={(value) =>
                setForm((current) => ({ ...current, fullName: value }))
              }
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(value) =>
                setForm((current) => ({ ...current, email: value }))
              }
            />
          </Field>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
            }}
          >
            <Field label="Phone (optional)">
              <Input
                inputMode="tel"
                value={form.phone}
                onChange={(value) =>
                  setForm((current) => ({ ...current, phone: value }))
                }
              />
            </Field>
            <Field label="Relationship (optional)">
              <Input
                value={form.relation}
                onChange={(value) =>
                  setForm((current) => ({ ...current, relation: value }))
                }
                placeholder="Mother, father, sponsor…"
              />
            </Field>
          </div>
          <Field label="Address (optional)">
            <Input
              value={form.address}
              onChange={(value) =>
                setForm((current) => ({ ...current, address: value }))
              }
            />
          </Field>
          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "11px 13px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={form.sendInvite}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sendInvite: event.target.checked,
                }))
              }
              style={{ marginTop: 2 }}
            />
            <span>
              <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>
                Send a password-setup invitation now
              </span>
              <span
                className="muted"
                style={{ display: "block", fontSize: 12 }}
              >
                Off by default. Creating the relationship alone does not create
                a login or send email.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        open={unlinking !== null}
        onClose={() => !busy && setUnlinking(null)}
        title="Unlink parent from this student?"
        width={500}
        footer={
          <>
            <Button onClick={() => setUnlinking(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmUnlink} disabled={busy}>
              {busy ? "Unlinking…" : "Unlink relationship"}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          <strong>{unlinking?.name}</strong> will immediately lose access to
          this student. The parent account and any links to other students will
          remain. This action is audit-logged.
        </p>
      </Modal>
    </>
  );
}
