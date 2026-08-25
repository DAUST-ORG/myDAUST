"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The station is a full-bleed 1180x800 kiosk surface, so it lives outside this shell.
 * The sidebar still lists it; this hop is what makes that link work.
 */
export default function ScannerRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/station"), [router]);
  return null;
}
