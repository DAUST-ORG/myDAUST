"use client";

import { useCallback, useEffect, useState } from "react";
import { type ChildSummary, getMyChildren } from "@/lib/api";

const STORAGE_KEY = "daust.parent.activeChild";

/**
 * Loads the guardian's children and remembers which one is selected across
 * parent screens, so switching child on one page carries to the next.
 * The stored id is validated against the server response — a guardian whose
 * access was revoked must not keep viewing a cached child.
 */
export function useChildren() {
  const [children, setChildren] = useState<ChildSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyChildren()
      .then((list) => {
        setChildren(list);
        const stored = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
        const valid = stored && list.some((c) => c.studentId === stored) ? stored : list[0]?.studentId ?? null;
        setActiveId(valid);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const select = useCallback((studentId: string) => {
    setActiveId(studentId);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, studentId);
  }, []);

  const active = children?.find((c) => c.studentId === activeId) ?? null;
  return { children, active, activeId, select, error };
}
