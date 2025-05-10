"use client";
import { useEffect, useState } from "react";

export default function useDeviceDetection() {
  const [{ isMobile, isTablet, isDesktop }, setDevice] = useState(() => {
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
