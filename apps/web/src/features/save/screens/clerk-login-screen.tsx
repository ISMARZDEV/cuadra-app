import { SignIn } from "@clerk/clerk-react";
import { useEffect, useState } from "react";

// Login del portal con Clerk: <SignIn/> renderiza los métodos habilitados en el dashboard
// (email/password, Google, Apple) y maneja el redirect OAuth. Al autenticar, el ClerkAuthBridge
// alimenta el token a las llamadas autenticadas (alertas). Sign in with Apple debe estar activo
// en el dashboard (App Store lo exige junto a Google).
//
// SSR-safe: `<SignIn/>` es un componente client-only (necesita el navegador) y LANZA si se renderiza
// server-side → 500 en la página de login SSR. Se difiere a después del mount (server/1er render =
// placeholder; cliente = el widget real). Patrón estándar para componentes de Clerk bajo SSR (Vike).
export function ClerkLoginScreen() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="mx-auto flex min-h-[24rem] max-w-sm justify-center px-4 py-12">
      {mounted ? <SignIn /> : null}
    </div>
  );
}
