"use client";
import { useNavSticky } from "../_contexts/Sticky";
import Carousel from "./Carousel";

export default function Hero() {
  const { isSticky } = useNavSticky();

  // const { isMobile, isTablet, isDesktop } = useDeviceDetection();

  //   const [interval, setInterval] = useState<NodeJS.Timeout | null>(null);

  // const handleNext = () => {
  //   setIndex((prev) => (prev + 1) % images.length);

  //   // when a button is clicked, clear the interval
  //   if (intervalRef.current !== null) {
  //     clearInterval(intervalRef.current);
  //   }
  // };

  // const handlePrev = () => {
  //   setIndex((prev) => (prev - 1 + images.length) % images.length);

  //   if (intervalRef.current !== null) {
  //     clearInterval(intervalRef.current);
  //   }
  // };

  return (
    <Carousel
      className={isSticky ? "mt-[80px]" : ""}
      images={["/images/black-skin.png"]}
    />
  );
}
