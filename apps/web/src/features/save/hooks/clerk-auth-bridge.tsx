import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useEffect } from "react";

import { registerTokenGetter } from "./use-auth";

// Bridges Clerk's session into the authenticated API calls: registers Clerk's `getToken` so every
// authed request carries a FRESH session token (Clerk tokens are short-lived). Clears it on
// sign-out. Renders nothing — mount it once under <ClerkProvider> (see `ClerkShell`, mounted from
// `pages/+Wrapper.tsx`).
export function ClerkAuthBridge() {
  const { isSignedIn, getToken } = useClerkAuth();

  useEffect(() => {
    registerTokenGetter(isSignedIn ? () => getToken() : () => null);
    return () => registerTokenGetter(() => null);
  }, [isSignedIn, getToken]);

  return null;
}
