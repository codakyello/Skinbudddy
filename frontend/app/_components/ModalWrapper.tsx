import { Box, position } from "@chakra-ui/react";
import useOutsideClick from "../_hooks/useOutsideClick";

export default function ModalWrapper({
  onClose,
  onMouseEnter,
  onMouseLeave,
  position,
  listenCapturing = true,
  children,
  className,
}: {
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  listenCapturing?: boolean;
  position?: "center" | "top" | "bottom" | "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useOutsideClick<HTMLDivElement>(
    onClose || (() => {}),
    listenCapturing
  );

  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={ref}
      className={`${className} bg-white
          ${position === "center" ? "center-modal" : ""}
          ${position === "top" ? "top-modal" : ""}
          ${position === "bottom" ? "bottom-modal" : ""}
          ${position === "left" ? "left-modal" : ""}
          ${position === "right" ? "right-modal" : ""} `}
    >
      {children}
    </Box>
  );
}
