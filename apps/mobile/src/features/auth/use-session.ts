import { useAuth } from "@clerk/expo";

import { CLERK_ENABLED } from "./clerk";
import { useAuthStore, type AuthStatus } from "./use-auth-store";

// Unified session status for the root gate — abstracts the auth mode so `_layout` doesn't branch.
// Clerk mode → derive from Clerk's useAuth; dev mode → the dev-login store. CLERK_ENABLED is a
// build-time constant (env), so the branch is INVARIANT per process → the conditional hook calls
// are safe (hook order never changes across renders).
export function useSession(): AuthStatus {
  if (CLERK_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- invariant build-time branch (see above)
    const { isLoaded, isSignedIn } = useAuth();
    return !isLoaded ? "loading" : isSignedIn ? "authenticated" : "unauthenticated";
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- invariant build-time branch (see above)
  return useAuthStore((s) => s.status);
}
