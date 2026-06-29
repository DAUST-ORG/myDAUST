"use client";

import { createContext, useContext, useState } from "react";
import { ApplyModal } from "./ApplyModal";
import { Footer, Header, useReveal } from "./site";

const ApplyContext = createContext<() => void>(() => {});
export const useApply = () => useContext(ApplyContext);

export function PageFrame({ active, children }: { active?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useReveal();
  return (
    <ApplyContext.Provider value={() => setOpen(true)}>
      <Header active={active} onApply={() => setOpen(true)} />
      <main>{children}</main>
      <Footer />
      <ApplyModal open={open} onClose={() => setOpen(false)} />
    </ApplyContext.Provider>
  );
}
