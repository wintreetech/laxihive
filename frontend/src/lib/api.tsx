import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
export const API = import.meta.env.VITE_API_URL || "/api";
let csrf: string | null = null;
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Unable to reach the hive. Check your connection and try again.",
    );
  }
  const data = await response
    .json()
    .catch(() => ({ message: "The server is temporarily unavailable." }));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  if (data.csrf !== undefined) csrf = data.csrf;
  return data;
}
export const post = (path: string, data: unknown = {}) =>
  api(path, { method: "POST", body: JSON.stringify(data) });
const AuthContext = createContext<any>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const q = useQueryClient(),
    toast = useToast();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api("/auth/session"),
    retry: 1,
    staleTime: 60000,
  });
  const refresh = useCallback(() => q.invalidateQueries(), [q]);
  return (
    <AuthContext.Provider
      value={{
        user: session.data?.user ?? null,
        requireEmailVerification:
          session.data?.requireEmailVerification ?? true,
        loading: session.isPending,
        error: session.error,
        refresh,
        logout: async () => {
          try {
            await post("/auth/logout");
            csrf = null;
            q.setQueryData(["session"], {
              user: null,
              csrf: null,
              requireEmailVerification:
                session.data?.requireEmailVerification ?? true,
            });
            q.removeQueries({
              predicate: (query) => query.queryKey[0] !== "session",
            });
          } catch (e: any) {
            toast(e.message);
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
const ToastContext = createContext<(text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (message) {
      const id = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(id);
    }
  }, [message]);
  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      {message && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing can disable storage; gameplay remains available. */
  }
}
export const money = (cents: number, currency = "USD") =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
export const number = (v: number = 0) => v.toLocaleString("en-US");
