"use client";

import { Box } from "@chakra-ui/react";
import {
  useTransition,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import ClipLoader from "react-spinners/ClipLoader";

const NavigationTransitionContext = createContext<{
  startNavigation: (cb: () => void) => void;
  isNavigating: boolean;
}>({
  startNavigation: () => {},
  isNavigating: false,
});

export function FullPageLoader({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startNavigation = (cb: () => void) => {
    startTransition(() => {
      cb();

      // Delay showing loader until after a short timeout
      timeoutRef.current = setTimeout(() => {
        if (isPending) {
          setIsNavigating(true);
        }
      }, 300); // Show only if transition lasts more than 300ms
    });
  };

  useEffect(() => {
    if (!isPending) {
      // Hide loader and clear timer
      setIsNavigating(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [isPending]);

  return (
    <NavigationTransitionContext.Provider
      value={{ startNavigation, isNavigating }}
    >
      {children}
      {isNavigating && isPending && (
        <Box className="fixed top-0 left-0 z-[9999] bg-[var(--color-modal-bg)] flex h-screen w-screen items-center justify-center">
          <ClipLoader color="#ffffffa9" size={20} />
        </Box>
      )}
    </NavigationTransitionContext.Provider>
  );
}

export function useLoadingTransition() {
  const context = useContext(NavigationTransitionContext);
  if (!context)
    throw new Error(
      "useLoadingTransition must be used within FullPageLoader provider"
    );
  return context;
}
