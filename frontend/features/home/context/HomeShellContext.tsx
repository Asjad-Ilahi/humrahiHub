"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

const STORAGE_KEY = "humrahi_home_view_mode";

export type HomeViewMode = "fundraising" | "work";

type Ctx = {
  mode: HomeViewMode;
  setMode: (m: HomeViewMode) => void;
  volunteerApproved: boolean;
  isWorkMode: boolean;
};

const HomeShellContext = createContext<Ctx | null>(null);

function readStoredMode(): HomeViewMode {
  if (typeof window === "undefined") return "fundraising";
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY);
    if (v === "work") return "work";
  } catch {
    /* ignore */
  }
  return "fundraising";
}

function writeStoredMode(m: HomeViewMode) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, m);
  } catch {
    /* ignore */
  }
}

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

export function HomeShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user } = usePrivy();
  const [mode, setModeState] = useState<HomeViewMode>("fundraising");
  const [volunteerApproved, setVolunteerApproved] = useState(false);
  const volunteerApprovedRef = useRef(false);
  volunteerApprovedRef.current = volunteerApproved;

  useEffect(() => {
    setModeState(readStoredMode());
  }, []);

  const setMode = useCallback((next: HomeViewMode) => {
    if (next === "work" && !volunteerApprovedRef.current) return;
    setModeState(next);
    writeStoredMode(next);
  }, []);

  useEffect(() => {
    if (!volunteerApproved) {
      setModeState((prev) => {
        if (prev !== "fundraising") {
          writeStoredMode("fundraising");
          return "fundraising";
        }
        return prev;
      });
      return;
    }
    if (pathname === "/home/work") {
      setModeState((prev) => {
        if (prev !== "work") writeStoredMode("work");
        return "work";
      });
    } else if (pathname === "/home") {
      setModeState((prev) => {
        if (prev !== "fundraising") writeStoredMode("fundraising");
        return "fundraising";
      });
    }
  }, [pathname, volunteerApproved]);

  useEffect(() => {
    if (!user?.id) {
      setVolunteerApproved(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/volunteers/me`, {
          headers: { "x-privy-user-id": user.id },
        });
        const json = (await res.json()) as { data?: { approved?: boolean } };
        if (!cancelled && res.ok) setVolunteerApproved(Boolean(json.data?.approved));
        else if (!cancelled) setVolunteerApproved(false);
      } catch {
        if (!cancelled) setVolunteerApproved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const value = useMemo<Ctx>(
    () => ({
      mode,
      setMode,
      volunteerApproved,
      /** Work UI (proposals, work board) only when approved volunteer explicitly in work mode. */
      isWorkMode: volunteerApproved && mode === "work",
    }),
    [mode, setMode, volunteerApproved]
  );

  return <HomeShellContext.Provider value={value}>{children}</HomeShellContext.Provider>;
}

export function useHomeShell(): Ctx {
  const ctx = useContext(HomeShellContext);
  if (!ctx) {
    return {
      mode: "fundraising",
      setMode: () => {},
      volunteerApproved: false,
      isWorkMode: false,
    };
  }
  return ctx;
}
