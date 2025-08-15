"use client";

import { useRef } from "react";
import "locomotive-scroll/dist/locomotive-scroll.css";

export default function SmoothLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const scrollRef = useRef(null);

  // useEffect(() => {
  //   const scroll = new LocomotiveScroll({
  //     el: scrollRef.current!,
  //     smooth: true,
  //   });

  //   return () => {
  //     scroll.destroy();
  //   };
  // }, []);

  return (
    <div data-scroll-container ref={scrollRef}>
      {children}
    </div>
  );
}
