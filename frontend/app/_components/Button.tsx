export default function Button({
  onClick,
  className,
  children,
  action = "button",
  disabled,
  loading,
  type,
}: {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
  action?: "button" | "submit" | "reset";
  type?: "primary" | "text" | "link" | "icon" | "outline";
}) {
  return (
    <button
      disabled={loading || disabled}
      type={action}
      onClick={onClick}
      className={`${className} 
      ${
        type === "primary"
          ? " bg-[var(--color-primary)] py-[1.5rem] px-[2.4rem] "
          : ""
      }
      ${type === "text" ? "  text-[#000]  " : ""}
      ${type === "link" ? "  underline" : ""}
      ${
        type === "icon"
          ? "rounded-[50%] p-[1.2rem] border border-[#e4e4e4]"
          : ""
      }
      ${
        type === "outline"
          ? "border-[.1px] border-[#000] text-black py-[1.5rem] px-[2.4rem] hover:bg-black hover:text-white transition-all duration-300"
          : ""
      }
       `}
    >
      {!loading ? children : "...Loading"}
    </button>
  );
}
