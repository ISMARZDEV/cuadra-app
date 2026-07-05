import { useAuth } from "@clerk/expo";
import { useEffect } from "react";

import { registerTokenGetter } from "@/lib/api/client";

// Bridges Clerk's session into the generated SDK client: registers Clerk's `getToken` so every
// request carries a FRESH session token (Clerk tokens are short-lived; getToken refreshes on
// demand). Clears the getter on sign-out. Renders nothing — mount it once under <ClerkProvider>.
export function ClerkAuthBridge() {
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    registerTokenGetter(isSignedIn ? () => getToken() : null);
    return () => registerTokenGetter(null);
  }, [isSignedIn, getToken]);

  return null;
}
