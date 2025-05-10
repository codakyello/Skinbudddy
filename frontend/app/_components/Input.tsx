"use client";
import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";
import { GoCheck } from "react-icons/go";

export default function Input({
  name,
  id,
  type,
  placeholder,
  required,
  defaultValue,
  handleBlur,
  disabled,
  checked,
  onChange,
  value,
  className,
  focusOnMount = false,
  error,
}: {
  name: string;
  type?: string;
  id: string;
  placeholder?: string;
  required?: boolean;
  defaultChecked?: boolean;
  defaultValue?: string | number;
  disabled?: boolean;
  checked?: boolean;
  value?: string | number;
  className?: string;
  focusOnMount?: boolean;
  error?: string | null;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
}) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // check if focusOnMount is true
    if (focusOnMount) {
      inputRef.current?.focus();
    }
  }, [focusOnMount]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  };

  const hasInputValue = input.length > 0;

  return (
    <Box>
      <Box className="group relative">
        {/* Input field */}
        <input
          className={`w-full ${
            hasInputValue
              ? "px-[1.2rem] pt-[2.5rem] pb-[.8rem]"
              : "px-[1.2rem] py-[1.6rem]"
          }  focus-visible:px-[1.2rem] outline-none focus-visible:pt-[2.5rem] focus-visible:border-[var(--input-border-color-focus)] focus-visible:pb-[.8rem] text-[16px] bg-[var(--color-grey-0)]  text-[#000]  
          ${
            error
              ? "border border-b-[3px] border-b-[#e10000] focus-visible:border-b-[3px] focus-visible:border-[#e5e7eb] focus-visible:border-b-[#e10000]"
              : "border-[var(--input-border-color)] border focus-visible:border-[var(--input-border-color)]"
          } ${className} 
        
        }`}
          name={name}
          ref={inputRef}
          type={isPasswordVisible ? "text" : type}
          id={id}
          value={value}
          required={required}
          defaultValue={defaultValue}
          onBlur={handleBlur}
          disabled={disabled}
          checked={checked}
          onChange={(event) => {
            onChange?.(event);
            handleInputChange(event);
          }}
        />

        {/* Placeholder / label */}
        <label
          htmlFor={id}
          className={`absolute left-[1.2rem] ${error ? "text-[#e10000]" : ""} ${
            hasInputValue
              ? "top-[.8rem] text-[var(--input-label-color-focus)] text-[1.4rem]"
              : "top-[1.6rem] text-[1.6rem] text-[var(--input-label-color)]"
          } transition-all duration-200 group-focus-within:top-[.8rem] ${
            error
              ? "group-focus-within:text-[#e10000] group-focus-within:text-[1.4rem]"
              : "group-focus-within:text-[var(--input-label-color-focus)] group-focus-within:text-[1.4rem]"
          } `}
        >
          {placeholder}
        </label>

        {/* Eye Icon for password visibility toggle */}
        <Box className="absolute top-[50%] translate-y-[-50%] right-5">
          {type === "password" && (
            <Box>
              {isPasswordVisible ? (
                <IoEyeOutline
                  onClick={() => setIsPasswordVisible(false)}
                  className={`text-[#000] text-[2rem] ${
                    error ? "text-[#e10000]" : ""
                  } cursor-pointer`}
                />
              ) : (
                <IoEyeOffOutline
                  onClick={() => setIsPasswordVisible(true)}
                  className={`text-[#000] text-[2rem] ${
                    error ? "text-[#e10000]" : ""
                  } cursor-pointer`}
                />
              )}
            </Box>
          )}
        </Box>

        {/* Check Icon for validated form field except password */}
        {type !== "password" && !error && hasInputValue && (
          <Box className="absolute top-[50%] translate-y-[-50%] right-5">
            <GoCheck className="text-[20px] text-[#000]" />
          </Box>
        )}
      </Box>

      {error && (
        <p className="text-[#e10000] text-[1.4rem] pt-[.8rem] pl-[1.2rem]">
          {error}
        </p>
      )}
    </Box>
  );
}
