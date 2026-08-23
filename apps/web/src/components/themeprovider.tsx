import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => void;
};

const themeStorageKey = "cash-flow-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function storedThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setStoredThemePreference] =
    useState<ThemePreference>(storedThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(storedThemePreference()),
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");

    function applyTheme() {
      setResolvedTheme(resolveTheme(themePreference));
    }

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = themePreference;
    document
      .querySelector("#app-theme-color")
      ?.setAttribute(
        "content",
        resolvedTheme === "dark" ? "#0d1716" : "#f4f8f6",
      );
  }, [resolvedTheme, themePreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference(preference) {
        localStorage.setItem(themeStorageKey, preference);
        setStoredThemePreference(preference);
      },
    }),
    [themePreference, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
