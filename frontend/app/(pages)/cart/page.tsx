import Cart from "@/app/_components/Cart";
import CartTable from "@/app/_components/CartTable";
import Modal from "@/app/_components/Modal";
import { Tab, TabHeader, Tabs } from "@/app/_components/Tabs";
import { Box } from "@chakra-ui/react";
import { title } from "process";

export default async function Page() {
  return (
    <Tabs state="local" defaultTab="cart">
      <Box>
        <Box className="text-center uppercase bg-[#eaedf0] text-[1.8rem] py-[4.5rem] font-semibold">
          Shopping cart
        </Box>
        <Cart />
      </Box>
    </Tabs>
  );
}
