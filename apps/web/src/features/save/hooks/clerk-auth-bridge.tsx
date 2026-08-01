import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useEffect } from "react";

import { registerTokenGetter } from "./use-auth";

// Bridges Clerk's session into the authenticated API calls: registers Clerk's `getToken` so every
// authed request carries a FRESH session token (Clerk tokens are short-lived). Clears it on
// sign-out. Renders nothing — mount it once under <ClerkProvider> (see `ClerkShell`, mounted from
// `pages/+Wrapper.tsx`).
export function ClerkAuthBridge() {
  const { isSignedIn, getToken } = useClerkAuth();

  // Registro SÍNCRONO durante el render para ganarle a los efectos de los hijos que llaman
  // `authHeaders()` (p. ej. el histórico del detalle de canónicos). Clerk tarda en hidratar el
  // estado; si esperamos a useEffect, la primera petición autenticada sale sin token (401).
  registerTokenGetter(isSignedIn ? () => getToken() : () => null);

  useEffect(() => {
    return () => registerTokenGetter(() => null);
  }, []);

  return null;
}
