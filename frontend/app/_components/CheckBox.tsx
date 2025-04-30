import { Box } from "@chakra-ui/react";
import { useState } from "react";
import { GoCheck } from "react-icons/go";

export default function CheckBox({ name, id }: { name: string; id: string }) {
  const [isChecked, setIsChecked] = useState(false);

  return (
    <Box>
      <input
        type="checkbox"
        id={id}
        name={name}
        onChange={(e) => setIsChecked(e.target.checked)}
        className="hidden"
      />

      <label
        htmlFor={id}
        className="h-[22px] aspect-square border border-[var(--checkbox-border-color)] flex items-center justify-center cursor-pointer"
      >
        {isChecked ? (
          <GoCheck className="text-[20px] text-[var(--color-primary)]" />
        ) : (
          ""
        )}
      </label>
    </Box>
  );
}
