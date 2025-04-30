"use client";
import { usePathname } from "next/navigation";
import {
  createContext,
  ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from "react";

const DarkModeContext = createContext<
  | {
      isDarkMode: boolean;
      toggleDarkMode: () => void;
    }
  | undefined
>(undefined);

function DarkModeProvider({ children }: { children: ReactNode }) {
  // Set initial state based on the localStorage value or system preference
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const storedDarkMode = localStorage.getItem("isDarkMode");
      if (storedDarkMode) return JSON.parse(storedDarkMode);
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false; // Fallback for server-side rendering
  });

  const pathName = usePathname();

  // Update the class on mount and whenever isDarkMode changes
  useLayoutEffect(() => {
    if (pathName.startsWith("/dashboard")) {
      document.documentElement.classList.toggle("dark-mode", isDarkMode);
      document.documentElement.classList.toggle("light-mode", !isDarkMode);
    } else {
      document.documentElement.classList.remove("dark-mode");
      document.documentElement.classList.add("light-mode");
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("isDarkMode", JSON.stringify(isDarkMode));
    }
  }, [isDarkMode, pathName]);

  function toggleDarkMode() {
    setIsDarkMode((prevMode) => !prevMode);
  }

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

function useDarkMode() {
  const context = useContext(DarkModeContext);
  if (context === undefined)
    throw new Error("DarkModeContext was used outside of DarkModeProvider");
  return context;
}

export { DarkModeProvider, useDarkMode };
