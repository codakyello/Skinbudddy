import { useMutation, useQueryClient } from "@tanstack/react-query";

type MutationFunction<TData, TVariables> = (
  variables: TVariables
) => Promise<TData>;

export default function useCustomMutation<TData = unknown, TVariables = void>(
  mutateFn: MutationFunction<TData, TVariables>
) {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: mutateFn,
    onSuccess: () => {
      console.log("invalidating queries");
      queryClient.invalidateQueries();
    },
  });

  return { mutate, isPending };
}
