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
import { createPortal } from "react-dom";
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
    // Wait for the animation duration before closing
    await wait(0.25);
    setOpen("");
    document.body.classList.remove("close-modal");
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
  handler,
}: {
  children: ReactElement;
  handler?: () => void;
  name: string;
}) {
  const context = useContext(ModalContext);

  if (!context) return null;

  const { open } = context;

  return cloneElement(children, {
    onClick: () => {
      document.body.classList.remove("close-modal");
      open(name);

      handler?.();
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
    onMouseEnter: () => {
      if (!openCondition) return;
      setHovering(true);
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
  overlayColor,
}: {
  children: ReactElement;
  className?: string;
  name: string;
  position?: "center" | "top" | "bottom" | "left" | "right";
  openType?: "click" | "hover";
  listenCapturing?: boolean;
  overlayColor?: string;
}) {
  const { close, isOpen, setHovering } = useModal();

  // prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [isOpen]);

  const ref = useOutsideClick<HTMLDivElement>(close, listenCapturing);

  if (isOpen !== name) return "";

  return createPortal(
    <Box
      className={`fixed ${overlayColor} ${className}  modal-bg top-0 left-0 flex h-screen w-screen 
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
        className={`
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
    </Box>,
    document.body
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context)
    throw new Error("You cannot use modal context outside its provider");

  return context;
}
