import { providerLogoByName } from "../lib/provider-logos";
import type { ProviderBadgeProps } from "../interfaces";

// Insignia de un supermercado (A9 + comparativa): logo real cuando `logoUrl` llegó (F2·B1/B3); si
// no, un logo de cadena BUNDLEADO por nombre (`providerLogoByName`, Figma 502:6721); y si tampoco,
// el nombre como badge de texto — nunca un hueco vacío.
export function ProviderBadge({ name, logoUrl, className }: ProviderBadgeProps) {
  const src = logoUrl ?? providerLogoByName(name);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={className ?? "max-h-8 max-w-28 object-contain"}
      />
    );
  }
  return <span className={className ?? "truncate text-sm font-bold"}>{name}</span>;
}
