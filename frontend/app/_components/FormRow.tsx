import { Box } from "@chakra-ui/react";

export function FormRow({
  label,
  defaultValue,
  name,
  inputType = "text",
  required = true,
  onInputChange,
  error,
}: {
  label?: string;
  defaultValue?: string;
  name: string;
  inputType?: string;
  required?: boolean;
  error?: string | undefined;
  onInputChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Box>
      <Box className="flex flex-col gap-[1rem] items-start">
        {label && (
          <label
            className="text-[1.1rem] uppercase font-semibold"
            htmlFor={name}
          >
            {label}
          </label>
        )}

        <input
          onChange={onInputChange}
          required={required}
          type={inputType}
          defaultValue={defaultValue}
          className={`px-[13px] w-full py-[10px]  border-[1px] ${error ? "border-[#cf2929] focus-visible:border-[#cf2929]" : "border-gray-200 "} `}
          id={name}
          name={name}
        />
      </Box>

      {error ? (
        <p className="text-[#e10000] text-[1.2rem] pt-[.1rem] mb-[.5rem]">
          {error}
        </p>
      ) : (
        <p className="text-[#e10000] opacity-0 text-[1.3rem] pt-[.1rem] mb-[.5rem]">
          {"error"}
        </p>
      )}
    </Box>
  );
}
