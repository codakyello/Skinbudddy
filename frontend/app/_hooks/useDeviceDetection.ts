"use client";
import { useEffect, useState } from "react";

export default function useDeviceDetection() {
  const [device, setDevice] = useState(() => {
    if (typeof window === "undefined") {
      return { isMobile: false, isTablet: false, isDesktop: false };
    }

    const width = window.innerWidth;
    return {
      isMobile: width < 768,
      isTablet: width >= 768 && width <= 1024,
      isDesktop: width > 1024,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setDevice({
        isMobile: width < 768,
        isTablet: width >= 768 && width <= 1024,
        isDesktop: width > 1024,
      });
    };

    // Initial check in case component is mounted after resize
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return device;
}
