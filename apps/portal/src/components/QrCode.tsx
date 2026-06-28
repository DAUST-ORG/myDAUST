"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#153b6a", light: "#ffffff" } })
      .then(setUrl)
      .catch(() => {});
  }, [value, size]);
  if (!url) return <div style={{ width: size, height: size, background: "var(--gray-50)", borderRadius: 12 }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="QR code" width={size} height={size} style={{ borderRadius: 12 }} />;
}
