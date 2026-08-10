"use client";

/*
 * ImageSlot — the design's <image-slot> elements. Renders a licensed DAUST photo
 * (`src`, official photography from daust.org) when given one, else a tasteful navy
 * placeholder with the subject labeled (never a broken/empty image) — used where no
 * photo fits yet (e.g. individual faculty portraits fall back to a monogram).
 */
import { useEffect, useState } from "react";
import { assetUrl } from "@/lib/api";

export function ImageSlot({
  label,
  mono,
  src,
  variant = "navy",
}: {
  label: string;
  mono?: string;
  src?: string;
  variant?: "navy" | "steel";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const bg =
    variant === "steel"
      ? "linear-gradient(150deg,#1d4a82 0%,#153b6a 60%,#0f2c50 100%)"
      : "linear-gradient(150deg,#0f2c50 0%,#153b6a 70%,#1d4a82 100%)";
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export, plain img by design
      <img
        src={assetUrl(src)}
        alt={label}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      aria-label={label}
      style={{
        position: "absolute",
        inset: 0,
        background: bg,
        overflow: "hidden",
        display: "flex",
        alignItems: mono ? "center" : "flex-end",
        justifyContent: mono ? "center" : "flex-start",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      {mono ? (
        <span
          style={{
            position: "relative",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "clamp(40px,7vw,72px)",
            letterSpacing: "-.02em",
            color: "rgba(255,255,255,.9)",
          }}
        >
          {mono}
        </span>
      ) : (
        <div style={{ position: "relative", padding: "16px 18px", maxWidth: "90%" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,.72)",
            }}
          >
            <span style={{ width: 18, height: 3, background: "var(--daust-orange)" }} />
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
