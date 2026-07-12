import { ExternalLink, ImageOff, Users } from "lucide-react";

import { MethodBadge } from "@/features/admin/components/MethodBadge";
import { providerLogoByName } from "@/features/save/lib/provider-logos";

import { ConfidenceDonut } from "./ConfidenceDonut";
import type { StoreProductPanelProps } from "./interfaces";

// Pill neutro para Marca/Tamaño (módulo-scope, no inline).
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
      {children}
    </span>
  );
}

// Bloque etiqueta + contenido (dos columnas del panel).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// Columna izquierda del detalle: atributos crudos del store_product + confianza + método + conteo de
// candidatos. Imagen con espacio reservado + `loading="lazy"`. El logo de la tienda se resuelve en el
// front (`providerLogoByName`), con fallback al nombre en texto.
export function StoreProductPanel({
  name,
  brand,
  sizeText,
  imageUrl,
  sku,
  ean,
  providerName,
  url,
  confidence,
  method,
  candidateCount,
  locale,
}: StoreProductPanelProps) {
  const providerLogo = providerLogoByName(providerName);

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-black/5 bg-card p-4 shadow-sm dark:border-white/10">
      <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        Producto de la tienda
      </span>

      <div className="flex gap-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name ?? "Producto de la tienda"}
            loading="lazy"
            width={72}
            height={72}
            className="size-18 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div
            className="flex size-18 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
            role="img"
            aria-label="Sin imagen"
          >
            <ImageOff className="size-6" aria-hidden="true" />
          </div>
        )}
        <p className="text-lg font-bold text-foreground">{name ?? "(sin nombre)"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca">{brand ? <Pill>{brand}</Pill> : <Pill>N/A</Pill>}</Field>
        <Field label="Tamaño">{sizeText ? <Pill>{sizeText}</Pill> : <span className="text-muted-foreground">—</span>}</Field>
        <Field label="SKU / EAN">
          <span className="text-sm font-medium text-foreground tabular-nums">{ean ?? sku ?? "—"}</span>
        </Field>
        <Field label="Tienda origen">
          {providerLogo ? (
            <img src={providerLogo} alt={providerName ?? "Tienda"} className="h-6 w-fit max-w-24 object-contain" />
          ) : (
            <span className="text-sm font-medium text-foreground">{providerName ?? "—"}</span>
          )}
        </Field>
      </div>

      {/* F0 (link a la tienda): abre la página del producto en la tienda origen. `<a>` real (más
          accesible que window.open), nueva pestaña + noopener. Sin URL → no se renderiza. */}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#b7e36f] bg-[#daff9f] px-3 py-2 text-sm font-semibold text-[#015442] transition-colors hover:bg-[#cdf58a] dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime dark:hover:bg-brand-lime/30"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Ver en la tienda
        </a>
      ) : null}

      <hr className="border-black/5 dark:border-white/10" />

      <div className="flex items-center gap-3">
        <ConfidenceDonut confidence={confidence} />
        <div>
          <p className="text-sm font-semibold text-foreground">Confianza del match</p>
          <p className="text-xs text-muted-foreground">Score fusionado de la cascada</p>
        </div>
      </div>

      <hr className="border-black/5 dark:border-white/10" />

      <div className="flex items-center gap-3">
        <MethodBadge method={method} locale={locale} />
        <p className="text-xs text-muted-foreground">Método que produjo el match</p>
      </div>

      <hr className="border-black/5 dark:border-white/10" />

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-sm font-bold text-foreground">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="tabular-nums">{candidateCount}</span>
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Candidatos encontrados</p>
          <p className="text-xs text-muted-foreground">Ordenados por similitud (score)</p>
        </div>
      </div>
    </aside>
  );
}
