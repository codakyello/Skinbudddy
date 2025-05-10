"use client";
import { useEffect, useState } from "react";

export default function useDeviceDetection() {
  const [{ isMobile, isTablet, isDesktop }, setDevice] = useState(() => {
    if (typeof window === "undefined") {
      return { isMobile: false, isTablet: false, isDesktop: false };
    }

    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
    const isDesktop = window.innerWidth > 1024;

    return { isMobile, isTablet, isDesktop };
  });

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
      const isDesktop = window.innerWidth > 1024;

      setDevice({ isMobile, isTablet, isDesktop });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return { isMobile, isTablet, isDesktop };
}
