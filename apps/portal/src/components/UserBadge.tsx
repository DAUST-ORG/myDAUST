"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, logout, type Me } from "@/lib/api";

export function UserBadge() {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  // Re-check the session on every route change so the badge reflects login/logout.
  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setReady(true));
  }, [pathname]);

  if (!ready) return null;
  if (!me)
    return (
      <Link href="/login" style={{ color: "#cfe0f5" }}>
        Sign in
      </Link>
    );

  async function signOut() {
    await logout();
    router.push("/login");
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, color: "#cfe0f5" }}>
      <span style={{ fontSize: 13 }}>
        {me.name} · {me.roles.join(", ")}
      </span>
      <button onClick={signOut} style={{ padding: "5px 10px" }}>Sign out</button>
    </span>
  );
}
