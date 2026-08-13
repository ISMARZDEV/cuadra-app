import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Envoltorio de TanStack Query para los tests. Se extrajo cuando el tercer archivo lo necesitó
// (el patrón venía copiado a mano desde `features/insights/api.test.tsx`).
//
// `retry: false` es lo que lo hace utilizable: con los reintentos por defecto, un test que espera
// un fallo se queda esperando los reintentos y agota el timeout en vez de fallar donde debe.
//
// Un QueryClient NUEVO por render, no el singleton de la app: su caché sobreviviría entre tests y
// un caso vería los datos que dejó el anterior.
export function QueryWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
