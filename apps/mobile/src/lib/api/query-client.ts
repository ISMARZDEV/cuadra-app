import { QueryClient } from "@tanstack/react-query";

// Single TanStack Query client for the app (cuadra-mobile skill: Query over the SDK).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
