/* eslint-disable @next/next/no-img-element */
import SectionBestSeller from "./_components/SectionBestSeller";
import Modal from "./_components/Modal";
import Hero from "./_components/Hero";

export default async function HomePage() {
  // const cart = await getUserCarts("67ec1c0dd0a01f1d47a6e49e");

  // console.log(cart);

  // This page should contain banners of our products, advertising popular brands we are selling, promotions, etc.

  return (
    <Modal>
      <Hero />
      <SectionBestSeller />
    </Modal>
  );
}
