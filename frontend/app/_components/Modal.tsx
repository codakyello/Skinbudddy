"use client";
import { Box } from "@chakra-ui/react";
import {
  cloneElement,
  createContext,
  ReactElement,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import useOutsideClick from "../_hooks/useOutsideClick";
import { wait } from "../_utils/utils";

const ModalContext = createContext<
  | {
      isOpen: string;
      open: (name: string) => void;
      close: () => void;
      hovering: boolean;
      setHovering: (value: boolean) => void;
    }
  | undefined
>(undefined);

export default function Modal({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState("");
  const [hovering, setHovering] = useState(false);
  const open = setOpen;

  console.log(isOpen);

  // adding close-modal class but not closing
  const close = useCallback(async () => {
    console.log("close called");
    // The close animation
    document.body.classList.add("close-modal");
    // Wait for the animation to finish before closing
    await wait(0.1);
    setOpen("");
  }, []);

  return (
    <ModalContext.Provider
      value={{ isOpen, open, close, hovering, setHovering }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function ModalOpen({
  children,
  name,
}: {
  children: ReactElement;
  name: string;
}) {
  const context = useContext(ModalContext);

  if (!context) return null;

  const { open } = context;

  return cloneElement(children, {
    onClick: () => {
      document.body.classList.remove("close-modal");
      open(name);
    },
  });
}

export function ModalHoverOpen({
  children,
  openCondition = true,
  name,
}: {
  children: ReactElement;
  openCondition?: boolean;
  name: string;
}) {
  const { hovering, setHovering, open, close } = useModal();

  // close is being called unexpectedly

  useEffect(() => {
    if (hovering) {
      document.body.classList.remove("close-modal");
      return;
    }

    const timeout = setTimeout(async () => {
      close();
    }, 800);

    return () => clearTimeout(timeout);
  }, [hovering, close]);

  return cloneElement(children, {
    onMouseEnter: async () => {
      if (!openCondition) return;
      setHovering(true);
      await wait(0.5);
      open(name);
    },
    onMouseLeave: () => {
      console.log("hovering false");
      setHovering(false);
    },
  });
}

export function ModalWindow({
  children,
  className,
  name,
  position = "center",
  listenCapturing = false,
  openType = "click",
}: {
  children: ReactElement;
  className?: string;
  name: string;
  position?: "center" | "top" | "bottom" | "left" | "right";
  openType?: "click" | "hover";
  listenCapturing?: boolean;
}) {
  const { close, isOpen, setHovering } = useModal();

  const ref = useOutsideClick<HTMLDivElement>(close, listenCapturing);

  return isOpen === name ? (
    <Box
      className={`fixed ${className} modal-bg top-0 left-0 flex h-screen w-screen 
        ${position === "center" ? "items-center justify-center" : ""}
        ${position === "top" ? "items-start justify-center" : ""}
        ${position === "bottom" ? "items-end justify-center" : ""}
        ${position === "left" ? "items-end justify-start" : ""}
        ${position === "right" ? "items-end justify-end" : ""}`}
    >
      <Box
        onMouseLeave={() => {
          if (openType !== "hover") return;
          setHovering(false);
          close();
        }}
        onMouseEnter={() => {
          // set a state e.g hovering
          setHovering(true);
          console.log("setting hovering true");
          console.log("hovering true");
        }}
        className={`modal-box 
        ${position === "center" ? "center-modal" : ""}
        ${position === "top" ? "top-modal" : ""}
        ${position === "bottom" ? "bottom-modal" : ""}
        ${position === "left" ? "left-modal" : ""}
        ${position === "right" ? "right-modal" : ""}`}
        ref={ref}
      >
        {cloneElement(children, {
          onClose: close,
        })}
      </Box>
    </Box>
  ) : (
    ""
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context)
    throw new Error("You cannot use modal context outside its provider");

  return context;
}
