import { Box } from "@chakra-ui/react";
import useOutsideClick from "../_hooks/useOutsideClick";

export default function ModalWrapper({
  onClose,
  onMouseEnter,
  onMouseLeave,
  position,
  listenCapturing = true,
  children,
  className,
  animate = true,
}: {
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  listenCapturing?: boolean;
  position?: "center" | "top" | "bottom" | "left" | "right";
  className?: string;
  animate?: boolean;
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
          ${position === "center" && animate ? "center-modal" : ""}
          ${position === "top" && animate ? "top-modal" : ""}
          ${position === "bottom" && animate ? "bottom-modal" : ""}
          ${position === "left" && animate ? "left-modal" : ""}
          ${position === "right" && animate ? "right-modal" : ""} `}
    >
      {children}
    </Box>
  );
}
