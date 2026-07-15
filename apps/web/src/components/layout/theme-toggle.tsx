import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePageI18n } from "@/i18n/usePageI18n";

// Toggle claro/oscuro: alterna la clase .dark en <html> y persiste en localStorage. El estado
// inicial se lee tras montar (SSR no conoce el localStorage del cliente).
export function ThemeToggle() {
  const { t } = usePageI18n();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage no disponible */
    }
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("theme.toggle")}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
