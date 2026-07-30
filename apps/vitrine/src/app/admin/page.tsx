"use client";

import { useEffect } from "react";

// daust.net/admin is just an entry point: send editors to the portal-hosted CMS.
export default function AdminRedirect() {
  useEffect(() => {
    const h = window.location.host;
    const dest = h.startsWith("localhost")
      ? "http://localhost:3000/comms"
      : h.includes("azt.dev")
        ? "https://daust-staging.azt.dev/comms"
        : "https://my.daust.net/comms";
    window.location.replace(dest);
  }, []);
  return (
    <p style={{ fontFamily: "system-ui, sans-serif", padding: 40, color: "#153b6a" }}>
      Redirecting to the myDAUST content manager…
    </p>
  );
}
