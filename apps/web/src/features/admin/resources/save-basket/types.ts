// Mercado por defecto del alta (3.16) — mismo patrón que `save-providers/components/ProvidersScreen.tsx`
// (`DEFAULT_MARKET`): la canasta curada hoy solo cubre DO (backfill de 213 queries, batch 3D).
export const DEFAULT_BASKET_MARKET = "DO";

// Etiqueta para agrupar filas sin `category_label` — evita un grupo con clave `undefined`/`null`
// en el `Map` de agrupación del screen.
export const UNCATEGORIZED_LABEL = "Sin categoría";
