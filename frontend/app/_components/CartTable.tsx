"use client";

import Table, { Body, Header } from "./Table";
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
    <Table columns={["30rem", "20rem", "15rem", "20rem", "auto"]}>
      <Header headers={["Product", "Price", "Quantity", "Total", "Delete"]} />

      <Body>
        {cart.map((item, index) => (
          <CartRow
            key={item._id}
            item={{
              ...item,
              product: { ...item.product, images: [images[index]] },
            }}
          />
        ))}
      </Body>
    </Table>
  );
}
