import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect } from 'react';
import { installSessionExpiryHandler } from '@/features/session/session';
import { queryClient } from '@/lib/query-client';
import { router } from '@/router';

export function App() {
  useEffect(() => installSessionExpiryHandler(router), []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
