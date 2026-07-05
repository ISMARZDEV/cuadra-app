import { CLERK_ENABLED } from "../hooks/clerk";
import { ClerkLoginScreen } from "./clerk-login-screen";
import { DevLoginScreen } from "./dev-login-screen";

// Dual-mode login: Clerk (<SignIn/>) cuando está configurado, dev-login fallback para dev local.
export function LoginScreen() {
  return CLERK_ENABLED ? <ClerkLoginScreen /> : <DevLoginScreen />;
}
