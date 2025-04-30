import Link from "next/link";
import { useLoadingTransition } from "../_contexts/FullPageLoader";
import { useRouter } from "next/navigation";

export default function TransitionLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { startNavigation } = useLoadingTransition();
  const router = useRouter();
  return (
    <Link
      className={className}
      onClick={(e) => {
        e.preventDefault();
        startNavigation(() => {
          router.push(href);
        });
      }}
      href={href}
    >
      {children}
    </Link>
  );
}
