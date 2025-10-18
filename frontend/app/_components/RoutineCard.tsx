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
        <Box className="w-[90%] md:w-[75%] flex">
          <ProductCard
            onProductToPreview={onProductToPreview}
            inChat={true}
            product={routine.product}
          />
        </Box>

        {Array.isArray(routine.alternatives) &&
          routine.alternatives.length > 0 &&
          routine.alternatives.map((option, index) => (
            <Box
              key={`${option.productId ?? option.product?._id ?? index}`}
              className="min-w-[90%] md:min-w-[75%] flex"
            >
              <ProductCard
                onProductToPreview={onProductToPreview}
                inChat={true}
                product={option.product}
              />
            </Box>
          ))}
      </Box>
    </Box>
  );
}
