import { Box } from "@chakra-ui/react";
import ProductCard from "./ProductCard";
import { Product, RoutineStep } from "../_utils/types";

export default function RoutineCard({
  routine,
  onProductToPreview,
}: {
  routine: RoutineStep;
  onProductToPreview: (product: Product) => void;
}) {
  console.log(routine, "This is routine in routine card");
  const alternativeProducts = routine?.alternatives?.map((alt) => alt.product);
  const products = [routine.product, ...(alternativeProducts ?? [])];
  return (
    <Box className="flex flex-col gap-4">
      <Box>
        <h4 className="text-[14px] leading-[20px] font-semibold">
          Step {routine.step}
          {" : "}
          {routine.title ??
            routine.category?.replace(/-/g, " ") ??
            "Routine step"}
        </h4>
        {routine.description ? (
          <p className="text-[14px] leading-[20px]">{routine.description}</p>
        ) : null}
      </Box>
      <Box className="mt-6 flex items-stretch gap-[1rem] overflow-auto">
        {products.map((product, index) => (
          <Box
            key={index}
            className={`${products.length > 1 ? "min-w-[85%]  md:min-w-[75%]" : "w-[85%] md:w-[75%]"}  flex`}
          >
            <ProductCard
              onProductToPreview={onProductToPreview}
              inChat={true}
              product={product}
            />
          </Box>
        ))}
        {/* {Array.isArray(routine.alternatives) &&
          routine.alternatives.length > 0 &&
          routine.alternatives.map((option, index) => (
            <Box
              key={`${option.productId ?? option.product?._id ?? index}`}
              className="min-w-[90%] md:min-w-[75%] flex"
            >
              {products.map((product) => (
                <ProductCard
                  onProductToPreview={onProductToPreview}
                  inChat={true}
                  product={option.product}
                />
              ))}
            </Box>
          ))}
       </Box> */}
      </Box>
    </Box>
  );
}
