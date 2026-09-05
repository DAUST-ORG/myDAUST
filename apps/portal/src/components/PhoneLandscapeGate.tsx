"use client";

import { useEffect, useState } from "react";

/**
 * TEMPORARY — remove once phone layouts ship.
 *
 * Blocks portrait phones (≤767px wide, portrait) behind a
 * rotate-to-landscape notice. Landscape phones, tablets and desktops pass
 * through untouched. Rendered from the root layout so it covers every portal
 * route, and decided client-side so there is no SSR mismatch.
 */
const PORTRAIT_PHONE_QUERY = "(max-width: 767px) and (orientation: portrait)";

export default function PhoneLandscapeGate() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(PORTRAIT_PHONE_QUERY);
    const sync = () => setBlocked(query.matches);
    sync();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }
    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  if (!blocked) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--daust-navy, #153b6a)",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 340 }}>
        <div
          aria-hidden
          style={{
            width: 44,
            height: 76,
            border: "3px solid #fff",
            borderRadius: 10,
            margin: "0 auto 16px",
            position: "relative",
            opacity: 0.95,
          }}
        >
          <div
            style={{
              width: 12,
              height: 3,
              borderRadius: 2,
              background: "#fff",
              position: "absolute",
              bottom: 7,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          />
        </div>
        <p
          className="eyebrow"
          style={{ marginBottom: 8, color: "var(--daust-orange, #ed8425)" }}
        >
          Landscape required
        </p>
        <h1 className="page-title" style={{ fontSize: 24, color: "#fff" }}>
          Please rotate your phone
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.9 }}>
          The campus portal isn&apos;t ready for portrait phones yet. Rotate to
          landscape or switch to a larger screen to continue.
        </p>
      </div>
    </div>
  );
}
