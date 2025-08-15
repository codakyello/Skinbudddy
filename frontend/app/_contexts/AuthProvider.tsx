"use client";
import React, {
  useContext,
  createContext,
  useEffect,
  ReactNode,
  useReducer,
} from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { User } from "../_utils/types";
import { generateGuestId } from "../_lib/data-service";

const AuthContext = createContext<
  | {
      user: User | null;
      isAuthenticating: boolean;
      authenticated: boolean;
      isLogoutAction: boolean;
      logout: () => void;
      login: (user: User | null, token: string | null) => void;
      getToken: () => string | null;
    }
  | undefined
>(undefined);

type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticating: boolean;
  authenticated: boolean;
  isLogoutAction: boolean;
};

type ActionType =
  | { type: "logout" }
  | { type: "user"; payload: User | null }
  | { type: "token"; payload: string | null }
  | { type: "authenticating/start" }
  | { type: "authenticating/finished" }
  | { type: "authenticated" }
  | { type: "not-authenticated" };

const initialState = {
  user: null,
  isAuthenticating: true,
  authenticated: false,
  isLogoutAction: false,
  token: null,
};

function reducer(state: AuthState, action: ActionType) {
  switch (action.type) {
    case "logout":
      return {
        ...state,
        user: null,
        token: null,
        authenticated: false,
      };

    case "user":
      return { ...state, user: action.payload };
    case "token":
      return { ...state, token: action.payload };
    case "authenticating/start":
      return { ...state, isAuthenticating: true };
    case "authenticating/finished":
      return { ...state, isAuthenticating: false };
    case "authenticated":
      return { ...state, authenticated: true };
    case "not-authenticated":
      return { ...state, authenticated: false };

    default:
      // in development
      // throw new Error(
      //   `Unknown action type: ${action.type}. Please check the reducer for valid action types.`
      // );
      return state;
  }
}
function AuthProvider({
  children,
  authenticateFn,
}: {
  children: ReactNode;
  authenticateFn?: (token: string | null) => Promise<boolean>;
}) {
  const router = useRouter();

  const [
    { user, isAuthenticating, authenticated, isLogoutAction, token },
    dispatch,
  ] = useReducer(reducer, initialState);

  // Load user from localStorage on initial mount
  useEffect(() => {
    // setIsAuthenticating(true);
    dispatch({ type: "authenticating/start" });
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (storedUser && token) {
      dispatch({ type: "user", payload: JSON.parse(storedUser) });

      dispatch({ type: "token", payload: JSON.parse(token) });

      Cookies.set("token", JSON.parse(token));
    } else {
      // setIsAuthenticating(false);
      dispatch({ type: "authenticating/finished" });
      // setAuthenticated(false);
      dispatch({ type: "not-authenticated" });
    }
  }, []);

  // Check authenticated on mount
  useEffect(() => {
    // if (!token) {
    //   // setAuthenticated(false);
    //   dispatch({ type: "not-authenticated" });
    // }

    (async function authenticate() {
      // setIsAuthenticating(true);
      dispatch({ type: "authenticating/start" });

      try {
        const isAuthenticated = (await authenticateFn?.(token)) ?? false;

        if (!isAuthenticated) throw new Error("Not authenticated");
        dispatch({ type: "authenticated" });
      } catch {
        localStorage.removeItem("token");
        const guest = localStorage.getItem("user");
        const guestId = guest ? JSON.parse(guest)._id : null;

        try {
          const guest = await generateGuestId(guestId);
          dispatch({ type: "user", payload: guest });
        } catch (err) {
          console.error(err);
          // toast.error(
          //   err instanceof Error ? err.message : "An unknown error occurred."
          // );
        }
      } finally {
        // setIsAuthenticating(false);
        dispatch({ type: "authenticating/finished" });
      }
    })();
  }, [token, authenticateFn]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    }
    if (token) {
      localStorage.setItem("token", JSON.stringify(token));
      Cookies.set("token", token);
      console.log("token set");
    }
  }, [user, token]);

  function login(user: User | null, token: string | null) {
    dispatch({ type: "user", payload: user });
    dispatch({ type: "token", payload: token });
  }

  function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    dispatch({ type: "logout" });
  }

  function getToken(): string | null {
    const storedToken = localStorage.getItem("token");
    const token: string | null = storedToken ? JSON.parse(storedToken) : null;
    if (!token) {
      logout();
      router.push("/login");
    }
    return token;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticating,
        authenticated,
        isLogoutAction,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error("You cannot use Authentication outside its provider");

  return context;
}

export default AuthProvider;
