import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ThemeMode = "light" | "dark" | "system";

const ThemeCtx = createContext<{
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolved: "light" | "dark";
} | null>(null);

const STORAGE = "theme_mode";

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const s = localStorage.getItem(STORAGE) as ThemeMode | null;
    return s === "light" || s === "dark" || s === "system" ? s : "system";
  });
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolve(mode));

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE, m);
    setResolved(resolve(m));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode, resolved }), [mode, setMode, resolved]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("ThemeProvider missing");
  return v;
}
