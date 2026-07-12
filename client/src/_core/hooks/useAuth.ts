import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: 30000, // Check every 30 seconds
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    // Clear user data immediately for instant logout
    utils.auth.me.setData(undefined, null);
    localStorage.removeItem('manus-runtime-user-info');
    
    // Redirect to login page immediately
    window.location.href = getLoginUrl();
    
    // Send logout request to backend in the background (fire and forget)
    logoutMutation.mutate();
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  // Auto logout if user becomes null (deactivated or deleted)
  useEffect(() => {
    if (meQuery.isLoading) return;
    if (meQuery.data === null && !meQuery.isLoading && meQuery.isFetched) {
      // User was authenticated but now returns null - force logout
      const wasAuthenticated = localStorage.getItem('manus-runtime-user-info');
      if (wasAuthenticated && wasAuthenticated !== 'null') {
        logout().then(() => {
          window.location.href = getLoginUrl();
        });
      }
    }
  }, [meQuery.data, meQuery.isLoading, meQuery.isFetched, logout]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
