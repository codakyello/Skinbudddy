"use client";
import { Box } from "@chakra-ui/react";
import Carousel from "./Carousel";
import NavBar from "./NavBar";

export default function Hero() {

  return (
    <Box className="relative">
    <NavBar />
    <Carousel/>
    </Box>
  );
}
