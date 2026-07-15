import { CLERK_ENABLED } from "./clerk";
import { ClerkLoginScreen } from "./clerk-login-screen";
import { DevLoginScreen } from "./dev-login-screen";

// Dual-mode login: Clerk (AuthView) when configured, dev-login fallback for local dev.
export function LoginScreen() {
  return CLERK_ENABLED ? <ClerkLoginScreen /> : <DevLoginScreen />;
}
