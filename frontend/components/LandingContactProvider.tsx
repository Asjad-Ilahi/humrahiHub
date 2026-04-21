"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import ContactModal from "./ContactModal";

type LandingContactContextValue = {
  openContact: () => void;
};

const LandingContactContext = createContext<LandingContactContextValue | null>(null);

export function useLandingContact(): LandingContactContextValue {
  const ctx = useContext(LandingContactContext);
  if (!ctx) {
    return { openContact: () => {} };
  }
  return ctx;
}

export default function LandingContactProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openContact = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openContact }), [openContact]);

  return (
    <LandingContactContext.Provider value={value}>
      {children}
      <ContactModal open={open} onClose={onClose} />
    </LandingContactContext.Provider>
  );
}
