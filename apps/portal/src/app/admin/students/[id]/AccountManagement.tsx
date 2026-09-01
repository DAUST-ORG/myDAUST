"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, FormEvent } from "react";
import {
  AlertTriangle,
  Clock3,
  Copy,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Field, Modal } from "@/components/ui";
import {
  type RegistrarStudentAccount,
  type StudentCredentialMethod,
  type StudentCredentialResult,
  type StudentLoginAccountState,
  getRegistrarStudentAccount,
  issueRegistrarStudentCredential,
  signOutRegistrarStudentSessions,
  updateRegistrarStudentContactEmail,
} from "@/lib/api";
import styles from "./AccountManagement.module.css";

const ACCOUNT_STATES: Record<
  StudentLoginAccountState,
  {
    label: string;
    description: string;
    tone: ComponentProps<typeof Badge>["tone"];
  }
> = {
  not_activated: {
    label: "Not activated",
    description:
      "No password is installed. The student can self-activate or the registrar can create access here.",
    tone: "neutral",
  },
  setup_pending: {
    label: "Setup pending",
    description:
      "A one-time setup link is active and waiting for the student to choose a password.",
    tone: "warning",
  },
  must_change_password: {
    label: "Must change password",
    description:
      "A temporary password is active. The student must replace it after signing in.",
    tone: "warning",
  },
  active: {
    label: "Active",
    description: "The student has an active DAUST login.",
    tone: "success",
  },
  suspended: {
    label: "Suspended",
    description:
      "This identity is suspended. Account changes remain read-only until it is restored.",
    tone: "error",
  },
  archived: {
    label: "Archived",
    description:
      "This student record is archived. Account changes are unavailable.",
    tone: "neutral",
  },
  pending_payment: {
    label: "Pending payment",
    description:
      "The student record has not passed the enrollment payment gate. Account changes are unavailable.",
    tone: "warning",
  },
};

function accountDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("fr-SN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function pendingPurposeLabel(purpose: "first_time" | "password_reset") {
  return purpose === "first_time" ? "First-time setup" : "Password reset";
}

export function AccountManagement({ studentId }: { studentId: string }) {
  const [account, setAccount] = useState<RegistrarStudentAccount | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contactBusy, setContactBusy] = useState(false);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [credentialMethod, setCredentialMethod] =
    useState<StudentCredentialMethod>("temporary_password");
  const [rotationOnly, setRotationOnly] = useState(false);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialResult, setCredentialResult] =
    useState<StudentCredentialResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getRegistrarStudentAccount(studentId);
      setAccount(next);
      setContactEmail(next.contactEmail ?? "");
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load account information.",
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveContactEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    const normalized = contactEmail.trim() || null;
    if (normalized === account.contactEmail) return;

    setContactBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await updateRegistrarStudentContactEmail(
        studentId,
        normalized,
      );
      setAccount(next);
      setContactEmail(next.contactEmail ?? "");
      setNotice(
        normalized
          ? "Contact email updated. The DAUST login email was not changed."
          : "Contact email removed. The DAUST login email was not changed.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update the contact email.",
      );
    } finally {
      setContactBusy(false);
    }
  }

  function openCredentialDialog(method?: StudentCredentialMethod) {
    setCredentialMethod(method ?? "temporary_password");
    setRotationOnly(method === "setup_link");
    setError(null);
    setNotice(null);
    setCredentialDialogOpen(true);
  }

  function closeCredentialDialog() {
    if (credentialBusy) return;
    setCredentialDialogOpen(false);
    setRotationOnly(false);
  }

  async function issueCredential() {
    if (!account) return;
    setCredentialBusy(true);
    setError(null);
    try {
      const result = await issueRegistrarStudentCredential(
        studentId,
        credentialMethod,
      );
      setCredentialDialogOpen(false);
      setRotationOnly(false);
      setCredentialResult(result);
      setCopied(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create student credentials.",
      );
    } finally {
      setCredentialBusy(false);
    }
  }

  async function copyCredential() {
    if (!credentialResult) return;
    if (!navigator.clipboard) {
      setError(
        "Copy is unavailable in this browser. Select the value manually.",
      );
      return;
    }
    const value =
      credentialResult.method === "temporary_password"
        ? `${credentialResult.loginEmail}\n${credentialResult.temporaryPassword}`
        : credentialResult.setupUrl;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the value manually.");
    }
  }

  function closeCredentialResult() {
    setCredentialResult(null);
    setCopied(false);
  }

  async function signOutAll() {
    setSignOutBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signOutRegistrarStudentSessions(studentId);
      setSignOutOpen(false);
      setNotice("All existing sessions for this student have been signed out.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not sign out the student's sessions.",
      );
    } finally {
      setSignOutBusy(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading account information…</p>;
  }

  if (!account) {
    return (
      <div className={styles.error} role="alert">
        {error ?? "Account information is unavailable."}
      </div>
    );
  }

  const state = ACCOUNT_STATES[account.accountState];
  const normalizedContactEmail = contactEmail.trim() || null;
  const contactChanged = normalizedContactEmail !== account.contactEmail;
  const actionLabel = account.hasLogin ? "Reset password" : "Generate login";
  const pending = account.pendingCredential;
  const setupLinkWillRotate = credentialMethod === "setup_link" && pending;

  return (
    <div className={styles.shell}>
      <div className={styles.statusBanner}>
        <div className={styles.statusIdentity}>
          <div className={styles.statusIcon} aria-hidden="true">
            <ShieldCheck size={19} />
          </div>
          <div>
            <h2 className={styles.statusTitle}>Student account access</h2>
            <p className={styles.statusDescription}>{state.description}</p>
          </div>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      {notice && (
        <div className={styles.notice} role="status" aria-live="polite">
          {notice}
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.contentGrid}>
        <section className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <Mail size={16} aria-hidden="true" />
            <h3 className={styles.sectionTitle}>Identity & contact</h3>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.identityGrid}>
              <div className={styles.readOnlyField}>
                <span className={styles.fieldLabel}>DAUST login email</span>
                <div className={styles.loginValue}>
                  {account.loginEmail ?? "Not assigned"}
                </div>
                <span className={styles.fieldHint}>
                  This is the sign-in identity and cannot be changed here.
                </span>
              </div>

              <form onSubmit={saveContactEmail}>
                <div className={styles.contactRow}>
                  <Field
                    label="Contact email"
                    hint="Used for contact only. It does not change how the student signs in."
                  >
                    <input
                      type="email"
                      value={contactEmail}
                      maxLength={160}
                      autoComplete="email"
                      placeholder="student@example.com"
                      disabled={
                        contactBusy || !account.eligibleForCredentialAction
                      }
                      onChange={(event) => setContactEmail(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={
                      !contactChanged ||
                      contactBusy ||
                      !account.eligibleForCredentialAction
                    }
                  >
                    {contactBusy ? "Saving…" : "Save contact"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <Clock3 size={16} aria-hidden="true" />
            <h3 className={styles.sectionTitle}>Account history</h3>
          </div>
          <div className={styles.sectionBody}>
            <dl className={styles.timeline}>
              <AccountDatum
                label="Account created"
                value={accountDate(account.accountCreatedAt)}
              />
              <AccountDatum
                label="Last successful login"
                value={accountDate(account.lastLoginAt)}
              />
              <AccountDatum
                label="Password changed"
                value={accountDate(account.passwordChangedAt)}
              />
            </dl>
            {pending && (
              <div className={styles.pending}>
                <strong>
                  {pendingPurposeLabel(pending.purpose)} link pending
                </strong>
                <br />
                Expires {accountDate(pending.expiresAt)}. Issuing another setup
                link will invalidate this one.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className={styles.actionStrip}>
        <div className={styles.actionCopy}>
          <strong>Access controls</strong>
          <span>
            {account.eligibleForCredentialAction
              ? "Choose a temporary password or a one-time setup link. Every action is audited."
              : (account.credentialBlockReason ??
                "Account changes are unavailable for this record.")}
          </span>
        </div>
        <div className={styles.actionButtons}>
          <Button
            variant="navy"
            icon={<KeyRound size={15} />}
            disabled={!account.eligibleForCredentialAction}
            onClick={() => openCredentialDialog()}
          >
            {actionLabel}
          </Button>
          {pending && (
            <Button
              variant="secondary"
              icon={<RefreshCw size={14} />}
              disabled={!account.eligibleForCredentialAction}
              onClick={() => openCredentialDialog("setup_link")}
            >
              Rotate setup link
            </Button>
          )}
          <Button
            variant="ghost"
            icon={<LogOut size={14} />}
            disabled={!account.hasLogin || !account.eligibleForCredentialAction}
            onClick={() => setSignOutOpen(true)}
          >
            Sign out all sessions
          </Button>
        </div>
      </div>

      <Modal
        open={credentialDialogOpen}
        onClose={closeCredentialDialog}
        title={rotationOnly ? "Rotate setup link" : actionLabel}
        width={540}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={credentialBusy}
              onClick={closeCredentialDialog}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={credentialBusy}
              onClick={issueCredential}
            >
              {credentialBusy
                ? "Working…"
                : credentialMethod === "temporary_password"
                  ? account.hasLogin
                    ? "Replace password"
                    : "Generate password"
                  : setupLinkWillRotate
                    ? "Rotate link"
                    : "Create setup link"}
            </Button>
          </>
        }
      >
        {error && (
          <div
            className={styles.error}
            role="alert"
            style={{ marginBottom: 14 }}
          >
            {error}
          </div>
        )}
        <p
          className="muted"
          style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}
        >
          {rotationOnly
            ? "Create a replacement one-time link for this student."
            : `Choose how ${account.hasLogin ? "to reset" : "to create"} this student's access.`}
        </p>

        {!rotationOnly && (
          <div
            className={styles.choiceGroup}
            role="radiogroup"
            aria-label="Credential method"
          >
            <label
              className={styles.choice}
              data-selected={credentialMethod === "temporary_password"}
            >
              <input
                type="radio"
                name="credential-method"
                value="temporary_password"
                checked={credentialMethod === "temporary_password"}
                onChange={() => setCredentialMethod("temporary_password")}
              />
              <span>
                <strong>Temporary password</strong>
                <span>
                  Show a password once. The student must change it after signing
                  in.
                </span>
              </span>
            </label>
            <label
              className={styles.choice}
              data-selected={credentialMethod === "setup_link"}
            >
              <input
                type="radio"
                name="credential-method"
                value="setup_link"
                checked={credentialMethod === "setup_link"}
                onChange={() => setCredentialMethod("setup_link")}
              />
              <span>
                <strong>One-time setup link</strong>
                <span>
                  Give the student a link that expires in 30 minutes so they can
                  choose their own password.
                </span>
              </span>
            </label>
          </div>
        )}

        <div className={styles.warning}>
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {credentialMethod === "temporary_password"
              ? account.hasLogin
                ? "This immediately replaces the current password and signs out existing sessions."
                : "The password is shown once and must be copied before closing the result."
              : setupLinkWillRotate
                ? "This invalidates the currently pending link. The existing password remains valid until the replacement link is redeemed."
                : account.hasLogin
                  ? "The current password remains valid until this link is redeemed."
                  : "The link is shown once and expires 30 minutes after it is created."}
          </span>
        </div>
      </Modal>

      <Modal
        open={credentialResult !== null}
        onClose={closeCredentialResult}
        title={
          credentialResult?.method === "temporary_password"
            ? "Temporary password ready"
            : "Setup link ready"
        }
        width={520}
        footer={
          <Button variant="primary" onClick={closeCredentialResult}>
            Done
          </Button>
        }
      >
        {credentialResult && (
          <div className={styles.secretGrid}>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            <div className={styles.warning} style={{ marginTop: 0 }}>
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                Copy this information now. It will be cleared when this window
                closes and cannot be displayed again.
              </span>
            </div>
            <div className={styles.secretBox}>
              <span>DAUST login email</span>
              <strong>{credentialResult.loginEmail}</strong>
            </div>
            <div className={styles.secretBox}>
              <span>
                {credentialResult.method === "temporary_password"
                  ? "Temporary password"
                  : "One-time setup link"}
              </span>
              <strong>
                {credentialResult.method === "temporary_password"
                  ? credentialResult.temporaryPassword
                  : credentialResult.setupUrl}
              </strong>
            </div>
            {credentialResult.method === "setup_link" && (
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                Expires {accountDate(credentialResult.expiresAt)}.
              </p>
            )}
            <Button
              variant="secondary"
              icon={
                credentialResult.method === "setup_link" ? (
                  <Link2 size={14} />
                ) : (
                  <Copy size={14} />
                )
              }
              onClick={copyCredential}
            >
              {copied
                ? "Copied"
                : credentialResult.method === "temporary_password"
                  ? "Copy email + password"
                  : "Copy setup link"}
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={signOutOpen}
        onClose={() => !signOutBusy && setSignOutOpen(false)}
        title="Sign out all sessions"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={signOutBusy}
              onClick={() => setSignOutOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={signOutBusy}
              onClick={signOutAll}
            >
              {signOutBusy ? "Signing out…" : "Sign out all sessions"}
            </Button>
          </>
        }
      >
        {error && (
          <div
            className={styles.error}
            role="alert"
            style={{ marginBottom: 14 }}
          >
            {error}
          </div>
        )}
        <p style={{ margin: 0, lineHeight: 1.65, fontSize: 13.5 }}>
          This student will be signed out on every browser and device. Their
          pending setup or password-reset link will also be revoked. Their
          password will not change, so they can sign in again afterward.
        </p>
      </Modal>
    </div>
  );
}

function AccountDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.datum}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
