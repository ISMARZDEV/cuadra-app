import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { translate } from "@/i18n/messages";

import { categoryColor } from "./category-colors";

export interface CategoryBadgeProps {
  slug: string | null | undefined;
  name: string | null | undefined;
  /** Locale explícito (SSR admin — ver `useAdminI18n`, no hay señal de idioma en la URL). */
  locale?: Locale;
  className?: string;
}

// Badge de categoría para la cola de revisión (columna "Categoría" del Figma 483:12411): color por
// slug (`categoryColor`, mapa data-driven que mirrorea `categoryIcon`), texto-only por decisión de
// batch (el Figma de la tabla muestra el badge sin ícono; `categoryIcon` queda disponible para
// cuando el look pida el glyph, ej. la card de categoría en vez de la fila de tabla).
//
// `category` en `AdminReviewQueueRowDto` es NULLABLE hasta que corra la clasificación (cambio
// `save-category-classification`) — por eso el fallback NUNCA es un hueco vacío, siempre un chip
// neutro con copy localizado.
export function CategoryBadge({ slug, name, locale = DEFAULT_LOCALE, className }: CategoryBadgeProps) {
  const { bg, text } = categoryColor(slug);
  const label = name ?? translate(locale, "admin.category.none");

  return (
    <span
      className={
        className ??
        "inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      }
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}
