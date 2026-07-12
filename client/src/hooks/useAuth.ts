import { trpc } from '@/lib/trpc';

/**
 * Hook for accessing the current authenticated user
 * Returns user data and loading state
 */
export function useAuth() {
  const { data: user, isLoading, error } = trpc.auth.me.useQuery();

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}

/**
 * Hook for logging out the current user
 */
export function useLogout() {
  const mutation = trpc.auth.logout.useMutation();

  return {
    logout: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
