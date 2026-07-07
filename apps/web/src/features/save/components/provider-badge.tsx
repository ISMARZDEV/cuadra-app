import type { ProviderBadgeProps } from "../interfaces";

// Insignia de un supermercado (A9 + comparativa): logo real cuando `logoUrl` llegó (F2·B1/B3), o
// el nombre como badge de texto si no — la MAYORÍA de proveedores no tiene logo todavía, así que
// el fallback de texto es el camino feliz de hoy, nunca un hueco vacío.
export function ProviderBadge({ name, logoUrl, className }: ProviderBadgeProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        loading="lazy"
        className={className ?? "max-h-8 max-w-28 object-contain"}
      />
    );
  }
  return <span className={className ?? "truncate text-sm font-bold"}>{name}</span>;
}
