import { SignIn } from "@clerk/clerk-react";

// Login del portal con Clerk: <SignIn/> renderiza los métodos habilitados en el dashboard
// (email/password, Google, Apple) y maneja el redirect OAuth. Al autenticar, el ClerkAuthBridge
// alimenta el token a las llamadas autenticadas (alertas). Sign in with Apple debe estar activo
// en el dashboard (App Store lo exige junto a Google).
export function ClerkLoginScreen() {
  return (
    <div className="mx-auto flex max-w-sm justify-center px-4 py-12">
      <SignIn />
    </div>
  );
}
