import bravo from "../assets/provider-logos/bravo.png";
import carrefour from "../assets/provider-logos/carrefour.png";
import jumbo from "../assets/provider-logos/jumbo.png";
import nacional from "../assets/provider-logos/nacional.png";
import pricesmart from "../assets/provider-logos/pricesmart.png";
import sirena from "../assets/provider-logos/sirena.png";

// Logos de cadenas bundleados (Figma 502:6721) — fallback cuando el proveedor NO tiene `logo_url`
// del backend (hoy la mayoría). Vite versiona/hashea cada PNG y devuelve su URL (funciona también
// en SSR de Vike). Para agregar una cadena: dejá su PNG en `assets/provider-logos/` y sumá una
// entrada acá con la clave normalizada (minúsculas, sin acentos). Aliases permitidos (ej. una
// sub-marca que reusa el logo del grupo).
const LOGO_BY_NAME: Record<string, string> = {
  bravo,
  carrefour,
  jumbo,
  "merca jumbo": jumbo,
  nacional,
  pricesmart,
  sirena,
};

// Normaliza el nombre a la clave del mapa: trim + minúsculas + sin acentos + espacios colapsados.
function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Logo bundleado de un proveedor por su nombre, o `undefined` si no hay uno conocido. */
export function providerLogoByName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return LOGO_BY_NAME[normalize(name)];
}
