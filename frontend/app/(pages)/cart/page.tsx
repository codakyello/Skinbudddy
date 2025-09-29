import Cart from "@/app/_components/Cart";
import { Tabs } from "@/app/_components/Tabs";
import { Box } from "@chakra-ui/react";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={"...Loading"}>
      <Tabs state="local" defaultTab="cart">
        <Box>
          <Box className="text-center uppercase bg-[#eaedf0] text-[1.8rem] py-[4.5rem] font-semibold">
            Shopping cart
          </Box>
          <Cart />
        </Box>
      </Tabs>
    </Suspense>
  );
}
