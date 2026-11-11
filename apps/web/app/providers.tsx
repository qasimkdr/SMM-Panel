"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // reuse data instead of refetching on every mount
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false, // no refetch storms when users switch tabs
            retry: (count, err) => count < 2 && (err as { status?: number })?.status !== 401,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
