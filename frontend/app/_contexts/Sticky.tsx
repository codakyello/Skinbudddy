"use client";
import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
} from "react";

interface StickyContextType {
  isSticky: boolean;
  setPosition: (pos: number) => void;
}

const StickyContext = createContext<StickyContextType | undefined>(undefined);

export function NavSticky({
  children,
  defaultPosition = 0,
}: {
  children: ReactNode;
  defaultPosition?: number;
}) {
  const [isSticky, setIsSticky] = useState(false);
  const [position, setPosition] = useState(defaultPosition);

  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY;

      setIsSticky(offset > position);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [position]);

  return (
    <StickyContext.Provider value={{ isSticky, setPosition }}>
      {children}
    </StickyContext.Provider>
  );
}

export function useNavSticky() {
  const context = useContext(StickyContext);
  if (!context) {
    throw new Error("useSticky must be used within a StickyProvider");
  }
  return context;
}
