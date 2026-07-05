// Clerk (IdP real) config + mode flag. Dual-mode: cuando NO hay publishable key (dev local),
// el app cae al dev-login; cuando la hay, usa Clerk (AuthView + JWKS en el backend).
export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
export const CLERK_ENABLED = CLERK_PUBLISHABLE_KEY.length > 0;
