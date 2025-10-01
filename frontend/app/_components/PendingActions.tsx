"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { useUser } from "../_contexts/CreateConvexUser";
import { Box } from "@chakra-ui/react";
import { useModal, ModalWindow } from "./Modal";
import { useAction, useMutation } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import Link from "next/link";

type PendingStatus = "pending" | "completed" | "dismissed";

type PendingAction = {
  id: string;
  prompt: string;
  status: PendingStatus;
  type:
    | "create_routine"
    | "update_routine"
    | "create_routine_in_progress"
    | "create_routine_completed";
  data: {
    productsToadd?: Id<"products">[];
    routineId?: string;
    orderId?: Id<"orders">;
  };
  createdAt: number;
  expiresAt?: number;
};

const AUTO_TOAST_TYPES = new Set<PendingAction["type"]>([
  "create_routine_in_progress",
  "create_routine_completed",
]);

const ROUTINE_TOAST_ID = "routine-creation-status";

export default function PendingActions() {
  const { user } = useUser();
  const { open, close } = useModal();
  const hasOpenedRef = useRef(false);
  const setStatus = useMutation(api.users.setPendingActionStatus);
  const createRoutine = useAction(api.routine.createRoutine);

  const { data } = useQuery(
    convexQuery(api.users.getPendingActions, {
      userId: (user?._id as string) || "",
    })
  );

  console.log(data, "These are the pending actions");
  //   console.log(data, "These are the pending actions");

  const processedAuto = useRef(new Set<string>());
  const routineToastIdRef = useRef<string | null>(null);
  const [routineReadyAction, setRoutineReadyAction] =
    useState<PendingAction | null>(null);

  const nextAction = useMemo(() => {
    const actions = (data?.actions as PendingAction[]) || [];
    return actions.find(
      (a) => a?.status === "pending" && !AUTO_TOAST_TYPES.has(a.type)
    );
  }, [data?.actions]);

  // Keep the content stable during close animations to avoid flicker
  const [currentAction, setCurrentAction] = useState<PendingAction | null>(
    null
  );

  // Delay opening the modal so it feels less abrupt when mounted via layout

  // Open once when conditions are met
  useEffect(() => {
    const actions = (data?.actions as PendingAction[]) || [];
    actions
      .filter((a) => a.status === "pending" && AUTO_TOAST_TYPES.has(a.type))
      .forEach((action) => {
        if (processedAuto.current.has(action.id)) return;

        processedAuto.current.add(action.id);

        const isExpired =
          typeof action.expiresAt === "number" && action.expiresAt < Date.now();
        if (!isExpired) {
          if (action.type === "create_routine_in_progress") {
            const prompt = action.prompt || "We are creating your routine";
            const toastId = routineToastIdRef.current || ROUTINE_TOAST_ID;
            toast.loading(prompt, {
              id: toastId,
              duration: Infinity,
            });
            routineToastIdRef.current = toastId;
          } else if (action.type === "create_routine_completed") {
            if (routineToastIdRef.current) {
              toast.success(action.prompt || "Your routine is ready", {
                id: routineToastIdRef.current,
                duration: 6000,
              });
              routineToastIdRef.current = null;
            } else {
              toast.success(action.prompt || "Your routine is ready");
            }
            setRoutineReadyAction(action);
            open("routine-ready");
            if (user?._id) {
              setStatus({
                userId: user._id as string,
                actionId: action.id,
                status: "completed",
              }).catch(() => {
                processedAuto.current.delete(action.id);
              });
            }
          }
        }
      });
  }, [data?.actions, setStatus, user?._id]);

  useEffect(() => {
    if (!nextAction || hasOpenedRef.current) return;

    const t = setTimeout(() => {
      hasOpenedRef.current = true;
      setCurrentAction(nextAction);
      open("pending-actions");
    }, 5000); // 5s gap before showing

    return () => clearTimeout(t);
  }, [nextAction, open]);

  async function handleUpdate(status: PendingStatus) {
    if (!nextAction || !user?._id) return;
    // close first then do the rest later
    close();
    try {
      await setStatus({
        userId: user._id as string,
        actionId: String((currentAction?.id ?? nextAction?.id) || ""),
        status,
      });
    } finally {
      hasOpenedRef.current = false;
      // Trigger a fresh fetch; the open effect will run again only if another pending action exists
      //   await refetch();
    }
  }

  async function handleAction(currentAction: PendingAction) {
    if (currentAction?.type === "create_routine") {
      // call create routine
      if (currentAction.data.productsToadd) {
        close();
        const toastId = routineToastIdRef.current || ROUTINE_TOAST_ID;
        toast.loading("We are creating your routine for you", {
          id: toastId,
          duration: Infinity,
        });
        routineToastIdRef.current = toastId;
        try {
          await createRoutine({
            productIds: currentAction.data.productsToadd,
            userId: user._id as string,
          });
          toast.success("Routine created successfully", {
            id: toastId,
          });
        } catch {
          toast.error("Routine could not be created", {
            id: toastId,
          });
        } finally {
          routineToastIdRef.current = null;
        }
      }
    }
    // update routine here
    if (currentAction?.type === "update_routine") {
      // call update routine
    }
  }

  function handleRoutineModalClose() {
    setRoutineReadyAction(null);
    close();
  }

  // toast inside useEffects

  // Always render the modal window so ModalContext can control visibility
  return (
    <>
      <ModalWindow
        name="pending-actions"
        position="center"
        listenCapturing={true}
        bgClassName="p-[2rem]"
        className="bg-black/25 z-[1000]"
      >
        <Box className="relative max-w-[56rem] w-[95%] bg-white rounded-[1.2rem] shadow-2xl overflow-hidden">
          <Box className="p-[2.4rem] border-b border-gray-200">
            <h3 className="text-[2rem] font-semibold">
              {currentAction?.prompt || nextAction?.prompt || "Heads up"}
            </h3>
            {!currentAction && !nextAction && (
              <p className="text-[1.4rem] text-gray-600 mt-[0.6rem]">
                We have a suggestion for you.
              </p>
            )}
          </Box>

          <Box className="p-[2rem] text-[1.4rem] text-gray-700">
            {currentAction?.type === "create_routine" && (
              <p>We can create a routine from your latest purchase.</p>
            )}
            {currentAction?.type === "update_routine" && (
              <p>We can enhance your existing routine with compatible items.</p>
            )}
          </Box>

          <Box className="p-[2rem] border-t border-gray-200 flex gap-[1rem] justify-end">
            <button
              onClick={() => handleUpdate("dismissed")}
              className="px-[1.6rem] py-[0.8rem] rounded-md border border-gray-300 hover:border-black hover:bg-black hover:text-white text-[1.4rem]"
            >
              Decline
            </button>
            <button
              onClick={() => {
                handleUpdate("completed");
                // create routine here
                handleAction(currentAction as PendingAction);
              }}
              className="px-[1.6rem] py-[0.8rem] rounded-md border border-gray-300 hover:bg-gray-100 text-[1.4rem]"
            >
              Accept
            </button>
          </Box>
        </Box>
      </ModalWindow>
      <ModalWindow
        name="routine-ready"
        position="center"
        bgClassName="bg-black/25 z-[1000]"
        listenCapturing={true}
      >
        <Box className="relative max-w-[44rem] bg-white rounded-[1.6rem] shadow-2xl overflow-hidden">
          <Box className="p-[2.4rem] border-b border-gray-200 text-center bg-[#f6f5ff]">
            <h3 className="text-[2.2rem] font-semibold text-[#2c215d]">
              {routineReadyAction?.prompt || "Your routine is ready"}
            </h3>
            <p className="text-[1.4rem] text-[#4c3f8f] mt-[0.8rem]">
              Everything’s set—let’s see how to use your new products.
            </p>
          </Box>

          <Box className="p-[2.4rem] text-[1.5rem] text-gray-700">
            <p className="leading-relaxed">
              We’ve prepared a personalized step-by-step routine based on your
              latest purchase. Review it now to stay consistent and get the most
              out of your products.
            </p>
          </Box>

          <Box className="p-[2.4rem] border-t border-gray-200 flex gap-[1rem] justify-end">
            <button
              onClick={handleRoutineModalClose}
              className="px-[1.6rem] py-[0.8rem] rounded-md border border-gray-300 hover:border-gray-500 hover:bg-gray-50 text-[1.4rem]"
            >
              Later
            </button>
            <Link
              href={
                routineReadyAction?.data?.routineId
                  ? `/routine/${routineReadyAction.data.routineId}`
                  : "/routine"
              }
              onClick={handleRoutineModalClose}
              className="px-[1.6rem] py-[0.8rem] rounded-md bg-[#4c3f8f] hover:bg-[#392f6b] text-white text-[1.4rem]"
            >
              View Routine
            </Link>
          </Box>
        </Box>
      </ModalWindow>
    </>
  );
}
