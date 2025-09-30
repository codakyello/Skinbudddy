"use client";
import { useMemo, useState } from "react";
import { Box } from "@chakra-ui/react";
import {
  SkinProfile,
  SkinType,
  SkinConcern,
  IngredientSensitivity,
} from "@/app/_utils/recommender";

type StepId =
  | "skinType"
  | "concerns"
  | "sensitivities"
  | "routine"
  | "environment"
  | "budgetPrefs";

export type QuizResult = SkinProfile;

export default function SkinQuiz({
  onComplete,
}: {
  onComplete: (result: QuizResult) => void;
}) {
  const [step, setStep] = useState<StepId>("skinType");
  const [profile, setProfile] = useState<SkinProfile>({
    skinType: "normal",
    concerns: [],
    sensitivities: [],
    routine: {
      cleanser: true,
      exfoliationPerWeek: 1,
      moisturizer: true,
      sunscreen: false,
      treatments: false,
    },
    environment: { climate: "temperate", sunExposure: "medium" },
    budget: "medium",
    preferences: { fragranceFree: false, vegan: false, crueltyFree: true },
  });

  const steps: { id: StepId; title: string; subtitle?: string }[] = [
    {
      id: "skinType",
      title: "Your Skin Type",
      subtitle: "Pick the option that fits you best",
    },
    {
      id: "concerns",
      title: "Your Skin Concerns",
      subtitle: "Select all that apply",
    },
    {
      id: "sensitivities",
      title: "Ingredient Sensitivities",
      subtitle: "Let us know what to avoid",
    },
    {
      id: "routine",
      title: "Current Routine",
      subtitle: "We’ll fill in the gaps",
    },
    {
      id: "environment",
      title: "Lifestyle & Environment",
      subtitle: "Climate and sun exposure",
    },
    {
      id: "budgetPrefs",
      title: "Budget & Preferences",
      subtitle: "Any final preferences?",
    },
  ];

  const stepIndex = steps.findIndex((s) => s.id === step);

  const canContinue = useMemo(() => {
    if (step === "skinType") return !!profile.skinType;
    if (step === "concerns") return profile.concerns.length > 0;
    return true;
  }, [step, profile]);

  function handleNext() {
    const i = steps.findIndex((s) => s.id === step);
    if (i < steps.length - 1) setStep(steps[i + 1].id);
    else onComplete(profile);
  }
  function handleBack() {
    const i = steps.findIndex((s) => s.id === step);
    if (i > 0) setStep(steps[i - 1].id);
  }

  function toggleConcern(c: SkinConcern) {
    setProfile((p) => ({
      ...p,
      concerns: p.concerns.includes(c)
        ? p.concerns.filter((v) => v !== c)
        : [...p.concerns, c],
    }));
  }

  function toggleSensitivity(s: IngredientSensitivity) {
    setProfile((p) => ({
      ...p,
      sensitivities: p.sensitivities.includes(s)
        ? p.sensitivities.filter((v) => v !== s)
        : [...p.sensitivities, s],
    }));
  }

  return (
    <Box className="max-w-[980px] w-full mx-auto">
      {/* Progress */}
      <Box className="flex items-center justify-center gap-3 mb-8">
        {steps.map((s, i) => (
          <Box key={s.id} className="flex items-center gap-2">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                i <= stepIndex
                  ? "bg-black text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-10 h-[2px] ${i < stepIndex ? "bg-black" : "bg-gray-200"}`}
              ></div>
            )}
          </Box>
        ))}
      </Box>
      <Box className="rounded-lg border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
        <h2 className="text-2xl md:text-3xl font-semibold mb-1">
          {steps[stepIndex].title}
        </h2>
        {steps[stepIndex].subtitle && (
          <p className="text-gray-600 mb-6">{steps[stepIndex].subtitle}</p>
        )}

        {step === "skinType" && (
          <Box className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(
              [
                "normal",
                "oily",
                "dry",
                "combination",
                "sensitive",
              ] as SkinType[]
            ).map((t) => (
              <button
                key={t}
                onClick={() => setProfile((p) => ({ ...p, skinType: t }))}
                className={`px-4 py-3 rounded-md border text-2xl capitalize transition ${
                  profile.skinType === t
                    ? "bg-black text-white border-black"
                    : "bg-white hover:bg-gray-50 border-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </Box>
        )}

        {step === "concerns" && (
          <Box className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(
              [
                "acne",
                "blackheads",
                "congestion",
                "hyperpigmentation",
                "uneven_tone",
                "redness",
                "eczema",
                "dullness",
                "dehydration",
                "wrinkles",
                "texture",
                "sun_damage",
              ] as SkinConcern[]
            ).map((c) => (
              <label
                key={c}
                className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={profile.concerns.includes(c)}
                  onChange={() => toggleConcern(c)}
                />
                <span className="capitalize text-2xl">
                  {c.replaceAll("_", " ")}
                </span>
              </label>
            ))}
          </Box>
        )}

        {step === "sensitivities" && (
          <Box className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(
              [
                "fragrance",
                "essential_oils",
                "alcohol",
                "retinoids",
                "ahas_bhas",
                "vitamin_c",
                "niacinamide",
              ] as IngredientSensitivity[]
            ).map((s) => (
              <label
                key={s}
                className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={profile.sensitivities.includes(s)}
                  onChange={() => toggleSensitivity(s)}
                />
                <span className="capitalize text-2xl">
                  {s.replaceAll("_", " ")}
                </span>
              </label>
            ))}
          </Box>
        )}

        {step === "routine" && (
          <Box className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Cleanser in routine</span>
              <input
                type="checkbox"
                checked={profile.routine.cleanser}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    routine: { ...p.routine, cleanser: e.target.checked },
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Moisturizer in routine</span>
              <input
                type="checkbox"
                checked={profile.routine.moisturizer}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    routine: { ...p.routine, moisturizer: e.target.checked },
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Sunscreen (AM)</span>
              <input
                type="checkbox"
                checked={profile.routine.sunscreen}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    routine: { ...p.routine, sunscreen: e.target.checked },
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Treatments/Actives</span>
              <input
                type="checkbox"
                checked={profile.routine.treatments}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    routine: { ...p.routine, treatments: e.target.checked },
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md md:col-span-2">
              <span className="text-2xl">Exfoliation per week</span>
              <select
                value={profile.routine.exfoliationPerWeek}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    routine: {
                      ...p.routine,
                      exfoliationPerWeek: Number(
                        e.target.value
                      ) as SkinProfile["routine"]["exfoliationPerWeek"],
                    },
                  }))
                }
                className="border rounded-md px-3 py-2 text-2xl"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </Box>
        )}

        {step === "environment" && (
          <Box className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Climate</span>
              <select
                value={profile.environment.climate}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    environment: {
                      ...p.environment,
                      climate: e.target
                        .value as SkinProfile["environment"]["climate"],
                    },
                  }))
                }
                className="border rounded-md px-3 py-2 text-2xl"
              >
                <option value="humid">Humid</option>
                <option value="dry">Dry</option>
                <option value="temperate">Temperate</option>
              </select>
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Sun exposure</span>
              <select
                value={profile.environment.sunExposure}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    environment: {
                      ...p.environment,
                      sunExposure: e.target
                        .value as SkinProfile["environment"]["sunExposure"],
                    },
                  }))
                }
                className="border rounded-md px-3 py-2 text-2xl"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </Box>
        )}

        {step === "budgetPrefs" && (
          <Box className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Budget</span>
              <select
                value={profile.budget}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    budget: e.target.value as SkinProfile["budget"],
                  }))
                }
                className="border rounded-md px-3 py-2 text-2xl"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Fragrance-free preferred</span>
              <input
                type="checkbox"
                checked={profile.preferences.fragranceFree}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    preferences: {
                      ...p.preferences,
                      fragranceFree: e.target.checked,
                    },
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Vegan preferred</span>
              <input
                type="checkbox"
                checked={profile.preferences.vegan}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    preferences: { ...p.preferences, vegan: e.target.checked },
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between p-3 border rounded-md">
              <span className="text-2xl">Cruelty-free preferred</span>
              <input
                type="checkbox"
                checked={profile.preferences.crueltyFree}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    preferences: {
                      ...p.preferences,
                      crueltyFree: e.target.checked,
                    },
                  }))
                }
              />
            </label>
          </Box>
        )}

        {/* Controls */}
        <Box className="mt-8 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={stepIndex === 0}
            className={`px-4 py-2 rounded-md border text-2xl ${
              stepIndex === 0
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-gray-50"
            }`}
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canContinue}
            className={`px-5 py-2.5 rounded-md text-2xl font-medium transition ${
              canContinue
                ? "bg-black text-white hover:opacity-90"
                : "bg-gray-300 text-gray-600 cursor-not-allowed"
            }`}
          >
            {stepIndex === steps.length - 1
              ? "See Recommendations"
              : "Continue"}
          </button>
        </Box>
      </Box>
    </Box>
  );
}
