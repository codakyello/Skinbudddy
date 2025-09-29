"use client";

import Table, { Body, Footer, Header } from "./Table";
import Modal from "./Modal";
import useUserCart from "../_hooks/useUserCart";
import { useUser } from "../_contexts/CreateConvexUser";
import { Cart } from "../_utils/types";
import CartRow from "./CartRow";

const images = [
  "/images/product/good-molecules.webp",
  "/images/product/cerave-daily.png",
  "/images/product/larosh-moisturizer.png",
  "/images/product/facefacts-moisturising-gel-cream.webp",
  "/images/product/good-molecules.webp",
  "/images/product/cerave-daily.png",
  "/images/product/larosh-moisturizer.png",
  "/images/product/facefacts-moisturising-gel-cream.webp",
  "/images/product/good-molecules.webp",
  "/images/product/cerave-daily.png",
  "/images/product/larosh-moisturizer.png",
  "/images/product/facefacts-moisturising-gel-cream.webp",
];

export default function CartTable({ cart }: { cart: Cart[] }) {
  return (
    <Modal>
      <Table columns={["30rem", "20rem", "15rem", "20rem", "auto"]}>
        <Header headers={["Product", "Price", "Quantity", "Total", "Delete"]} />

        <Body>
          {cart.map((item, index) => (
            <CartRow
              item={{
                ...item,
                product: { ...item.product, images: [images[index]] },
              }}
            />
          ))}
        </Body>
        {/* <Footer>
          {Number(count) > RESULTS_PER_PAGE ? <Pagination count={count} /> : ""}
        </Footer> */}
      </Table>
    </Modal>
  );
}
