import type { ProviderType, SourcePlatform } from "@cuadra/api-client";

import { PLATFORM_LABEL } from "../save-sources/types";

// Opciones de los <Select> del modal de proveedor. El backend (`ProviderType`/`SourcePlatform`,
// StrEnum) es la fuente de verdad de los VALORES; acá solo se enumeran para iterarlos en la UI.
//
// Ojo con CÓMO se enumeran. Esto era un `readonly SourcePlatform[]` escrito a mano y se quedó sin
// `rest_catalog` cuando el backend lo agregó: un array no comprueba exhaustividad, así que nadie se
// enteró. El síntoma era mudo y peligroso — al editar Bravo (que ES `rest_catalog`) el select
// aparecía VACÍO, y guardar le cambiaba la plataforma en silencio.
//
// La lista sale ahora de `PLATFORM_LABEL`, que es un `Record<SourcePlatform, string>`: si el backend
// agrega una plataforma, ese Record deja de compilar hasta que se cubra. El typecheck es el guardián,
// no la memoria de quien edite. Reusarlo además evita mantener DOS listas de lo mismo.
export const SOURCE_PLATFORM_OPTIONS = Object.keys(PLATFORM_LABEL) as readonly SourcePlatform[];

// Mismo truco para los tipos: el `Record` fuerza a cubrir todos los miembros del union.
const PROVIDER_TYPES: Record<ProviderType, true> = {
  supermarket: true,
  bank: true,
  insurer: true,
};
export const PROVIDER_TYPE_OPTIONS = Object.keys(PROVIDER_TYPES) as readonly ProviderType[];

export { platformLabel } from "../save-sources/types";
