"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@/app/_contexts/CreateConvexUser";

type DayPeriod = "am" | "pm" | "either";
type StepFrequency =
  | "daily"
  | "every_other_day"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "as_needed";

type RoutineStep = {
  id: string;
  order: number;
  period: DayPeriod;
  frequency: StepFrequency;
};

type RoutineSummary = {
  _id?: string;
  name?: string;
  createdAt?: number;
  steps?: RoutineStep[];
};

type GetUserRoutinesResult =
  | { success: true; routines: RoutineSummary[] }
  | { success: false; message: string };

export default function RoutineListPage() {
  const { user } = useUser();
  const result = useQuery(api.routine.getUserRoutines, {
    userId: user._id as string,
  }) as GetUserRoutinesResult | undefined;

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Your Routines</h1>
        <p className="text-sm text-gray-600">
          Please sign in to view your routines.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Your Routines</h1>
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    );
  }

  const routines: RoutineSummary[] = result && result.success ? result.routines : [];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Your Routines</h1>
      </div>
      {routines.length === 0 ? (
        <div className="rounded border p-6 bg-white">
          <p className="text-gray-700">You have no routines yet.</p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {routines.map((r: RoutineSummary) => {
            const created = new Date(Number(r?.createdAt || 0));
            const stepCount = Array.isArray(r?.steps) ? r.steps.length : 0;
            const amCount = Array.isArray(r?.steps)
              ? r.steps.filter((s: RoutineStep) => s.period === "am").length
              : 0;
            const pmCount = stepCount - amCount;
            return (
              <li key={String(r._id)} className="rounded border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium mb-1">
                      {r?.name || "Routine"}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {created.toLocaleDateString()} • {stepCount} steps (AM{" "}
                      {amCount}, PM {pmCount})
                    </p>
                  </div>
                  <Link
                    className="text-blue-600 hover:underline text-sm"
                    href={`/routine/${String(r._id)}`}
                  >
                    View
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
