import { Box } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { GoCheck } from "react-icons/go";

export default function CheckBox({
  name,
  id,
  checked,
  className,
}: {
  name: string;
  id: string;
  checked?: boolean;
  className?: string;
}) {
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    if (checked) setIsChecked(checked);
  }, [checked]);

  return (
    <Box>
      {/* disable internal state behaviour if external state is present */}
      <input
        type="checkbox"
        id={id}
        name={name}
        onChange={(e) => (checked ? setIsChecked(e.target.checked) : "")}
        className="hidden"
      />

      <label
        htmlFor={id}
        className={`${className} h-[22px] aspect-square border border-[#000] flex items-center justify-center cursor-pointer`}
      >
        {isChecked ? <GoCheck className="text-[20px] text-[#000]" /> : ""}
      </label>
    </Box>
  );
}
