"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Modal } from "@/components/ui";

/**
 * The one and only time this password is visible. It is not stored in plaintext, never
 * written to the audit row, and cannot be retrieved again -- the only way back is another
 * reset. Say so plainly, because the alternative is an administrator closing this and
 * assuming the credential was emailed. Nothing behind these addresses receives mail.
 */
export function CredentialsModal({
  name,
  email,
  tempPassword,
  onClose,
}: {
  name: string;
  email: string;
  tempPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      .writeText(`Sign in at my.daust.net\nAddress: ${email}\nPassword: ${tempPassword}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sign-in details — ${name}`}
      width={470}
      footer={
        <>
          <Button icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copy}>
            {copied ? "Copied" : "Copy details"}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "#fdf1dd",
            color: "var(--warning)",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          Shown once. Copy it now — it cannot be retrieved, and no email is sent.
        </div>

        <Row label="Address" value={email} />
        <Row label="Temporary password" value={tempPassword} mono />

        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          They will be asked to choose their own password the first time they sign in. Hand
          these details over in person or through a channel you already trust.
        </p>
      </div>
    </Modal>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg2)" }}>{label}</span>
      <code
        style={{
          padding: "9px 12px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          fontSize: mono ? 15 : 13.5,
          fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : "inherit",
          letterSpacing: mono ? "0.04em" : undefined,
          wordBreak: "break-all",
        }}
      >
        {value}
      </code>
    </div>
  );
}
