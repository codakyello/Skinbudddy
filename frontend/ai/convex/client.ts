import { AsyncLocalStorage } from "async_hooks";
import {
  fetchAction as baseFetchAction,
  fetchMutation as baseFetchMutation,
  fetchQuery as baseFetchQuery,
} from "convex/nextjs";

const tokenStore = new AsyncLocalStorage<string | null>();

type FetchOptions = {
  token?: string;
};

function mergeOptions(options: FetchOptions | undefined, token: string) {
  return options && typeof options === "object"
    ? { ...options, token }
    : { token };
}

export function runWithConvexAuthToken<T>(
  token: string | null,
  callback: () => Promise<T> | T
): Promise<T> | T {
  return tokenStore.run(token ?? null, callback);
}

export async function fetchMutation(
  reference: any,
  args: any,
  options?: FetchOptions
): Promise<any> {
  const token = tokenStore.getStore();
  if (token) {
    return baseFetchMutation(
      reference as any,
      args,
      mergeOptions(options, token)
    );
  }
  return baseFetchMutation(reference as any, args, options as any);
}

export async function fetchQuery(
  reference: any,
  args: any,
  options?: FetchOptions
): Promise<any> {
  const token = tokenStore.getStore();
  if (token) {
    return baseFetchQuery(reference as any, args, mergeOptions(options, token));
  }
  return baseFetchQuery(reference as any, args, options as any);
}

export async function fetchAction(
  reference: any,
  args: any,
  options?: FetchOptions
): Promise<any> {
  const token = tokenStore.getStore();
  if (token) {
    return baseFetchAction(
      reference as any,
      args,
      mergeOptions(options, token)
    );
  }
  return baseFetchAction(reference as any, args, options as any);
}
