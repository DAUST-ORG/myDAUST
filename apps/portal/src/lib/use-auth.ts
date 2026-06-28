"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, type Me } from "./api";

/** Gate a page on the session: redirects to /login if not authenticated. */
export function useAuth() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);
  return { me, loading };
}
