"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@/app/_contexts/CreateConvexUser";
import type { Product } from "@/app/_utils/types";

type DayPeriod = "am" | "pm" | "either";
type StepFrequency =
  | "daily"
  | "every_other_day"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "as_needed";

type PopulatedStep = {
  id: string;
  order: number;
  category?: string;
  categorySlug?: string;
  period: DayPeriod;
  frequency: StepFrequency;
  notes?: string;
  product?: Product | null;
  alternateProducts?: Product[];
};

type RoutineDoc = {
  _id?: Id<"routines"> | string;
  name?: string;
  createdAt?: number;
  steps: PopulatedStep[];
};

type GetRoutinePopulatedResult =
  | { success: true; routine: RoutineDoc }
  | { success: false; message: string; statusCode?: number };

const frequencyLabels: Record<StepFrequency, string> = {
  daily: "Used every day",
  every_other_day: "Every other day",
  weekly: "Used weekly",
  biweekly: "Every two weeks",
  monthly: "Used monthly",
  as_needed: "As needed",
};

const fallbackImage = "/images/product.jpg";

const stepBadgePalette = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
];

const SECTION_META: Record<DayPeriod | "either", { title: string; icon: string; badgeClass: string }>
  = {
    am: {
      title: "Morning Routine",
      icon: "☀️",
      badgeClass: "bg-amber-50 text-amber-600",
    },
    pm: {
      title: "Evening Routine",
      icon: "🌙",
      badgeClass: "bg-indigo-50 text-indigo-600",
    },
    either: {
      title: "Anytime Routine",
      icon: "✨",
      badgeClass: "bg-slate-50 text-slate-600",
    },
  };

function humanize(value?: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function getPrimaryCategory(product?: Product | null): string | null {
  if (!product) return null;
  const categories = product.categories;
  if (!categories || !Array.isArray(categories) || categories.length === 0)
    return null;

  const first = categories[0] as unknown;
  if (typeof first === "string") return humanize(first);
  if (first && typeof first === "object" && "name" in first) {
    const name = (first as { name?: string }).name;
    return humanize(name ?? undefined);
  }

  return null;
}

function getBrand(product?: Product | null): string | null {
  if (!product) return null;
  const anyProduct = product as Record<string, unknown>;

  const brandName = anyProduct?.brandName;
  if (typeof brandName === "string" && brandName.trim()) {
    return brandName;
  }

  const brand = anyProduct?.brand;
  if (typeof brand === "string" && brand.trim()) {
    return brand;
  }

  return null;
}

function StepCard({
  step,
  index,
  total,
}: {
  step: PopulatedStep;
  index: number;
  total: number;
}) {
  const product = step.product ?? null;
  const brand = getBrand(product);
  const categoryLabel =
    humanize(step.category) || humanize(step.categorySlug) ||
    getPrimaryCategory(product);
  const frequencyLabel = frequencyLabels[step.frequency];
  const stepBadgeClass = stepBadgePalette[index % stepBadgePalette.length];
  const productName = product?.name || categoryLabel || "Product";
  const imageSrc =
    (Array.isArray(product?.images) && product.images?.[0]) || fallbackImage;
  const stepNumber = step.order || index + 1;

  return (
    <li className="list-none">
      <div className="group flex gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04]">
        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-100">
          <img
            src={typeof imageSrc === "string" ? imageSrc : fallbackImage}
            alt={productName}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {brand && (
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {brand}
                </p>
              )}
              <p className="truncate text-lg font-semibold text-slate-900">
                {productName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                {categoryLabel && (
                  <span className="font-medium text-slate-600">
                    {categoryLabel}
                  </span>
                )}
                {frequencyLabel && (
                  <span>
                    • {frequencyLabel}
                  </span>
                )}
              </div>
            </div>

            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stepBadgeClass}`}>
              Step {stepNumber}
            </span>
          </div>

          {step.notes && (
            <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {step.notes}
            </p>
          )}

          <div className="mt-4 flex gap-1">
            {Array.from({ length: total }).map((_, dotIndex) => (
              <span
                key={dotIndex}
                className={`h-2 w-2 rounded-full ${
                  dotIndex <= index ? "bg-indigo-400" : "bg-indigo-100"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

function RoutineSection({
  period,
  steps,
}: {
  period: DayPeriod | "either";
  steps: PopulatedStep[];
}) {
  if (!steps.length) return null;

  const meta = SECTION_META[period];
  const total = steps.length;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              {meta.icon}
            </span>
            <h2 className="text-xl font-semibold text-slate-900">{meta.title}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {total} {total === 1 ? "step" : "steps"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.badgeClass}`}
        >
          {period.toUpperCase()}
        </span>
      </div>

      <ol className="space-y-4">
        {steps.map((step, index) => (
          <StepCard key={step.id} step={step} index={index} total={total} />
        ))}
      </ol>
    </section>
  );
}

export default function RoutineDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useUser();
  const rid = params?.id as string;
  const result = useQuery(api.routine.getUserRoutinePopulated, {
    userId: user?._id as string,
    routineId: rid as Id<"routines">,
  }) as GetRoutinePopulatedResult | undefined;

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Your Routine</h1>
          <p className="mt-3 text-sm text-slate-500">
            Sign in to view and manage your personalized skincare routine.
          </p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Loading your routine…</p>
        </div>
      </div>
    );
  }

  if (result && !result.success) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Routine</h1>
          <p className="mt-3 text-sm text-rose-500">
            {result.message || "Unable to load routine."}
          </p>
        </div>
      </div>
    );
  }

  const routine = (result && result.success ? result.routine : undefined) as
    | RoutineDoc
    | undefined;
  const steps: PopulatedStep[] = Array.isArray(routine?.steps)
    ? (routine!.steps as PopulatedStep[])
    : [];
  const am = steps
    .filter((s) => s.period === "am")
    .sort((a: PopulatedStep, b: PopulatedStep) => a.order - b.order);
  const pm = steps
    .filter((s) => s.period === "pm")
    .sort((a: PopulatedStep, b: PopulatedStep) => a.order - b.order);
  const either = steps
    .filter((s) => s.period === "either")
    .sort((a: PopulatedStep, b: PopulatedStep) => a.order - b.order);

  const created = new Date(Number(routine?.createdAt || 0));

  const totalSteps = steps.length;
  const subtitleParts = [
    created.toLocaleDateString(),
    totalSteps ? `${totalSteps} ${totalSteps === 1 ? "step" : "steps"}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/routine"
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          Back
        </Link>

        <div className="flex flex-1 flex-col items-center text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            My Routine
          </span>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            {routine?.name || "Routine"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {subtitleParts.join(" • ")}
          </p>
        </div>

        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-slate-800"
          aria-label="Add step"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-6 w-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-100">
          Insights
        </button>
        <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800">
          Share
        </button>
        <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800">
          Jump to morning ▾
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800">
            Edit details
          </button>
          <span className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
            {am.length + pm.length + either.length}/{totalSteps || 0}
          </span>
        </div>
      </div>

      <RoutineSection period="am" steps={am} />
      <RoutineSection period="pm" steps={pm} />
      <RoutineSection period="either" steps={either} />
    </div>
  );
}
