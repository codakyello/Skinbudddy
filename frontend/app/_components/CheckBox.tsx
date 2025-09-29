import { Box } from "@chakra-ui/react";
import { ChangeEvent, useState } from "react";
import { GoCheck } from "react-icons/go";

export default function CheckBox({
  name,
  id,
  className,
  onChange,
}: {
  name: string;
  id: string;
  checked?: boolean;
  className?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [isChecked, setIsChecked] = useState(false);

  // useEffect(() => {
  //   if (checked) setIsChecked(checked);
  // }, [checked]);

  return (
    <Box>
      {/* disable internal state behaviour if external state is present */}
      <input
        type="checkbox"
        id={id}
        name={name}
        onChange={(e) => {
          // set internal state
          setIsChecked(e.target.checked);
          // set external state
          onChange?.(e);
        }}
        // onChange={(e) => (checked ? setIsChecked(e.target.checked) : "")}
        className="hidden"
      />

      <label
        htmlFor={id}
        className={`${className} h-[22px] aspect-square border border-[#000] flex items-center justify-center cursor-pointer`}
      >
        {isChecked ? <GoCheck className="text-[14px] text-[#000]" /> : ""}
      </label>
    </Box>
  );
}
