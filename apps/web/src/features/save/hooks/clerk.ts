// Clerk (IdP real) config + mode flag para web. Dual-mode: sin publishable key (dev local) el
// portal cae al dev-login; con ella usa Clerk (<SignIn/> + JWKS en el backend). VITE_ = expuesta al
// cliente por Vite. El gate protege también el SSR/CI: sin key, nunca se monta <ClerkProvider>.
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
export const CLERK_ENABLED = CLERK_PUBLISHABLE_KEY.length > 0;
