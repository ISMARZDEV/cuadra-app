// Motivos de rechazo de un match en la cola de revisión. Fuente ÚNICA compartida por el
// `ReasonCodeSelect` (bulk-reject de la lista) y el `RejectPanel` (detalle rediseñado). El `value` es
// el valor WIRE que va al backend (`ResolveReview.reason_code`); el `label` es solo presentación.
export interface ReasonCode {
  value: string;
  label: string;
}

export const REASON_CODES: ReasonCode[] = [
  { value: "different_size", label: "Tamaño diferente" },
  { value: "different_brand", label: "Marca diferente" },
  { value: "different_product", label: "Producto diferente" },
  { value: "other", label: "Otro motivo" },
];
