import { formatAdminDate, formatAdminTime } from "@/features/admin/lib/format-datetime";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * El par fecha/hora del admin, en DOS líneas: `"Vie 19, Julio 2026"` arriba y `"4:54 p. m."` abajo.
 *
 * Es el patrón que fijó la columna "Fecha del match" de la cola de revisión, y ahora lo comparten
 * Orquestación (última y próxima corrida) y la tab de Assets. Vive en `admin/components` por eso
 * mismo: son tres consumidores REALES, no una abstracción adivinada.
 *
 * Sin fecha muestra un solo `—`: la segunda línea queda vacía a propósito, porque dos guiones
 * apilados se leen como si faltaran dos datos en vez de uno.
 */
export function AdminDateTime({
  iso,
  locale,
  className,
}: {
  iso: string | null | undefined;
  locale: Locale;
  className?: string;
}) {
  const time = formatAdminTime(iso, locale);
  return (
    <span className={cn("flex flex-col leading-tight", className)}>
      <span className="text-foreground">{formatAdminDate(iso, locale)}</span>
      {time ? <span className="text-xs text-muted-foreground">{time}</span> : null}
    </span>
  );
}
