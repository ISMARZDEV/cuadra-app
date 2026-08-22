import type { StorePriceDto } from "@cuadra/api-client";

import { formatMoney } from "@/lib/money";

// Lo que la pantalla de detalle DERIVA de sus datos, en funciones puras y fuera de los componentes.
//
// Vive aparte por la misma razón que `to-card-item` y `product-state`: es donde se concentran las
// decisiones que se pueden equivocar en silencio —un precio mal partido, una tienda acusada de cara
// sin serlo, una antigüedad negativa— y es lo único de esta pantalla que se puede probar de verdad
// bajo jsdom.

export type StoreRow = Pick<StorePriceDto, "provider_id" | "provider_name" | "price_minor" | "currency"> &
  Partial<StorePriceDto>;

/**
 * El precio grande del diseño, partido en entero y céntimos volados.
 *
 * ⭐ Los céntimos salen de lo que `formatMoney` produjo, NUNCA de un `% 100` a mano: la moneda
 * manda cuántos decimales tiene (el yen no tiene, el dinar tiene tres) y partir por 100 le
 * inventaría dos al JPY.
 */
export function priceParts(minor: number, currency: string): { whole: string; cents: string } {
  const formatted = formatMoney(minor, currency);
  const dot = formatted.lastIndexOf(".");
  if (dot === -1) return { whole: formatted, cents: "" };
  return { whole: formatted.slice(0, dot), cents: formatted.slice(dot + 1) };
}

export type Standing = "cheapest" | "priciest" | "middle" | "only";

export interface StoreStanding<T extends StoreRow = StoreRow> {
  row: T;
  price_minor: number;
  /** Cuánto MÁS cuesta que la más barata. 0 en la más barata. */
  extraMinor: number;
  standing: Standing;
}

/**
 * Ordena las tiendas y sitúa a cada una en el abanico.
 *
 * Los cuatro tiles de arriba y las etiquetas de cada fila salen de ESTE cálculo, igual que en el
 * panel del admin, y por el mismo motivo: allí el tile decía RD$76.00, la fila más cara RD$75.00 y
 * la diferencia RD$1.00 — tres números que no cerraban entre sí. Derivarlos de un solo sitio hace
 * que esa contradicción no pueda existir.
 *
 * `cheapest` gana a `priciest` a propósito: con todas empatadas el mínimo y el máximo son el mismo
 * número, y marcar a alguna como la más cara sería un desempate inventado.
 */
export function storeStandings<T extends StoreRow>(rows: readonly T[]): StoreStanding<T>[] {
  if (rows.length === 0) return [];
  const ordered = [...rows].sort((a, b) => a.price_minor - b.price_minor);
  const min = ordered[0].price_minor;
  const max = ordered[ordered.length - 1].price_minor;
  // Una sola tienda no es «la más barata» de nada: no hay contra qué compararla, y esa medalla
  // vacía prometería una comparación que no ocurrió.
  const single = ordered.length === 1;
  return ordered.map((row) => ({
    row,
    price_minor: row.price_minor,
    extraMinor: row.price_minor - min,
    standing: single
      ? "only"
      : row.price_minor === min
        ? "cheapest"
        : row.price_minor === max
          ? "priciest"
          : "middle",
  }));
}

export interface Freshness {
  unit: "minute" | "hour" | "day";
  value: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Cuánto hace que se vio ese precio.
 *
 * Es media mitad de la confianza en un comparador: un precio sin fecha no se puede juzgar. Por eso
 * `null` cuando no la hay — «hace un momento» sería mentir sobre lo único que sostiene el producto.
 *
 * Una marca del FUTURO (desfase del reloj del dispositivo) se trata como ahora: «hace -3 minutos»
 * le enseña el bug al usuario en vez de absorberlo.
 */
export function freshnessOf(capturedAt: string | null | undefined, now: Date = new Date()): Freshness | null {
  if (!capturedAt) return null;
  const seen = new Date(capturedAt).getTime();
  if (Number.isNaN(seen)) return null;
  const elapsed = Math.max(0, now.getTime() - seen);
  if (elapsed < HOUR_MS) return { unit: "minute", value: Math.floor(elapsed / MINUTE_MS) };
  if (elapsed < DAY_MS) return { unit: "hour", value: Math.floor(elapsed / HOUR_MS) };
  return { unit: "day", value: Math.floor(elapsed / DAY_MS) };
}

/**
 * El tinte de fondo de una fila de tienda DESTACADA (la más barata, o la elegida en la hoja).
 *
 * ⭐ Devuelve clases, no un color, y por una razón concreta: el color tiene que existir en los DOS
 * temas. Aquí había un `#F1F9EC` clavado en el estilo mientras el texto de la fila iba con
 * `text-text dark:text-text-dark`. En claro nadie lo notaba; en OSCURO el texto se volvía blanco,
 * el fondo se quedaba verde muy claro y el nombre de la tienda y su precio desaparecían.
 *
 * La regla general que deja: un tinte sin pareja en oscuro es un componente a medias. Si la mitad
 * de una fila sigue al tema, la otra mitad no puede quedarse quieta.
 *
 * El verde oscuro se sitúa entre la superficie (`#12201A`) y el borde (`#1E3A2A`) del tema oscuro:
 * lo justo para leerse como un realce y no como otra tarjeta.
 */
export function rowTintClass(highlighted: boolean): string {
  return highlighted ? "bg-[#F1F9EC] dark:bg-[#152A1D]" : "";
}
