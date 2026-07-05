import { useAuth as useClerkAuth } from "@clerk/expo";

import { CLERK_ENABLED } from "./clerk";
import { useAuthStore } from "./use-auth-store";

// Dual-mode sign-out. Clerk mode → Clerk's signOut (the bridge then clears the token getter and
// useSession flips to unauthenticated → the root gate returns to (auth)). Dev mode → the store's
// signOut. CLERK_ENABLED is a build-time constant → the conditional hook branch is invariant.
export function useSignOut(): () => Promise<void> {
  if (CLERK_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- invariant build-time branch
    const { signOut } = useClerkAuth();
    return async () => {
      await signOut();
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- invariant build-time branch
  return useAuthStore((s) => s.signOut);
}
