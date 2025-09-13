"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import useUserCart from "@/app/_hooks/useUserCart";
import { useUser } from "@/app/_contexts/CreateConvexUser";

function Section({ title, steps }: { title: string; steps: any[] }) {
  if (!steps.length) return null;
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <ol className="space-y-3">
        {steps.map((s: any) => (
          <li key={s.id} className="rounded border p-3 bg-white">
            <div className="flex items-start gap-3">
              <div className="text-gray-500 w-6">{s.order}.</div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium capitalize">
                    {s.category || s.categorySlug}
                  </div>
                  <div className="text-xs text-gray-500">{s.frequency}</div>
                </div>
                <div className="mt-1 text-sm">
                  {s.product?.name ? (
                    <div className="font-medium">{s.product.name}</div>
                  ) : (
                    <div className="italic text-gray-500">
                      Product unavailable
                    </div>
                  )}
                </div>
                {s.notes && (
                  <p className="mt-2 text-xs text-gray-600">{s.notes}</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function RoutineDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useUser();
  const rid = params?.id as string;
  const result = useQuery(api.routine.getUserRoutinePopulated, {
    userId: user?._id as string,
    routineId: rid as Id<"routines">,
  });

  if (!result) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-gray-600">Loading routine...</p>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Routine</h1>
        <p className="text-sm text-red-600">
          {(result as any).message || "Unable to load routine."}
        </p>
      </div>
    );
  }

  const routine = (result as any).routine;
  const steps: any[] = Array.isArray(routine?.steps) ? routine.steps : [];
  const am = steps
    .filter((s) => s.period === "am")
    .sort((a, b) => a.order - b.order);
  const pm = steps
    .filter((s) => s.period === "pm")
    .sort((a, b) => a.order - b.order);
  const either = steps
    .filter((s) => s.period === "either")
    .sort((a, b) => a.order - b.order);

  const created = new Date(Number(routine?.createdAt || 0));

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{routine?.name || "Routine"}</h1>
        <p className="text-sm text-gray-600">
          Created {created.toLocaleDateString()}
        </p>
      </div>

      <Section title="AM" steps={am} />
      <Section title="PM" steps={pm} />
      <Section title="Either" steps={either} />
    </div>
  );
}
