import { useState } from "react";
import { navigate } from "vike/client/router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import { useAuth } from "../hooks/use-auth";

// Login del portal (dev): email → /identity/dev-login → JWT. Con cuenta de la app (mismo email)
// se obtiene el MISMO user_id → las alertas se comparten entre app y web.
export function LoginScreen() {
  const { locale, country, t } = usePageI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await login(email.trim());
    setBusy(false);
    if (ok) void navigate(localeHref(locale, country, "/save/supermarkets/alerts"));
    else setError(true);
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">{t("login.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("login.hint")}</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <Input
          type="email"
          required
          autoFocus
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">✕</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
