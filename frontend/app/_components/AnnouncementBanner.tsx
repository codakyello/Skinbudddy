"use client";
import { Box } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Announcement } from "../_utils/types";

export default function AnnouncementBanner({
  announcements,
}: {
  announcements: Announcement[];
}) {
  const [index, setIndex] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % announcements?.length);
    }, 10000); // Change every 10 seconds

    return () => clearInterval(interval);
  }, [announcements?.length]);

  if (!announcements) return null;

  return (
    <Box className="bg-[#000] font-dmSans text-[14px] flex items-center justify-center h-[40px] text-[#fff]">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 30 }} // Start from below
          animate={{ opacity: 1, y: 0 }} // Move to center
          exit={{ opacity: 0, y: -30 }} // Exit upwards
          transition={{ duration: 0.2, ease: "easeIn" }}
          className="absolute"
        >
          {announcements?.[index]?.title}
        </motion.p>
      </AnimatePresence>
    </Box>
  );
}
