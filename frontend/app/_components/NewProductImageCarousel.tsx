import Carousel from "./Carousel";

export default function NewProductImageCarousel() {
  // get the latest products from db
  const images = ["/images/new-product--1.png"];

  return <Carousel images={images} />;
}
