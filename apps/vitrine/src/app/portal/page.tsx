"use client";

import { useEffect } from "react";

const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000";

/** Preserve old public-site links while the authenticated portal owns sign-in. */
export default function LegacyPortalRedirect() {
  useEffect(() => {
    window.location.replace(PORTAL_URL);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0a1a30",
        color: "#fff",
        fontFamily: "var(--font-body)",
        padding: 24,
      }}
    >
      <p style={{ margin: 0, textAlign: "center", lineHeight: 1.6 }}>
        Opening myDAUST…{" "}
        <a style={{ color: "#f28a2e" }} href={PORTAL_URL}>
          Continue to the portal
        </a>
      </p>
    </main>
  );
}
