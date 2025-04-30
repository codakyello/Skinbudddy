export default function SpinnerMini({ className }: { className?: string }) {
  return (
    <div
      className={`w-[2rem] aspect-square rounded-full border-2 border-r-transparent animate-spin border-gray-100 ${className}`}
    ></div>
  );
}
