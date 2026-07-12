// Shapes de props de los componentes del detalle "Revisar match" (rediseño). Archivo dedicado por
// la convención de `cuadra-web` (tipos fuera del JSX → portabilidad + una sola fuente).
import type { AdminReviewCandidateDto } from "@cuadra/api-client";

import type { Locale } from "@/i18n/config";

export interface StoreProductPanelProps {
  name: string | null;
  brand: string | null;
  sizeText: string | null;
  imageUrl: string | null;
  sku: string | null;
  ean: string | null;
  providerName: string | null;
  /** Confianza del match en 0..1 (para el donut). */
  confidence: number;
  /** Método crudo de la cascada (para el `MethodBadge`). */
  method: string;
  candidateCount: number;
  locale: Locale;
}

/** Valores crudos del `store_product` contra los que se comparan los candidatos. */
export interface CandidateStoreValues {
  name: string | null;
  brand: string | null;
  sizeText: string | null;
}

export interface CandidateCardProps {
  candidate: AdminReviewCandidateDto;
  store: CandidateStoreValues;
  /** Posición 1-based (ya ordenado por score desc). `rank === 1` ⇒ mejor candidato. */
  rank: number;
  onApprove: (canonicalProductId: string) => void;
  /** Deshabilita el botón aprobar mientras hay un resolve en curso. */
  disabled?: boolean;
}

/** Handlers de los atajos del revisor (compartidos por el teclado y los botones del banner). */
export interface ReviewActions {
  /** Aprobar el mejor candidato (top). */
  onApprove: () => void;
  /** Enfocar/abrir el flujo de rechazo (motivo). */
  onReject: () => void;
  /** Ir al siguiente match pendiente. */
  onNext: () => void;
  /** Ir al match anterior. */
  onPrev: () => void;
  /** Deshabilita las acciones mientras hay un resolve en curso. */
  disabled?: boolean;
}

export interface ShortcutsBannerProps extends ReviewActions {}

/** Posición del match dentro de la cola (para el pager "N / total"). */
export interface QueueContext {
  /** Posición 1-based, o `null` si no se pudo determinar (fuera de la primera página). */
  position: number | null;
  /** Total de matches pendientes en la cola. */
  total: number;
  /** Hay un match anterior/siguiente al que navegar. */
  hasPrev: boolean;
  hasNext: boolean;
}

export interface QueuePagerProps extends QueueContext {
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export interface DetailHeaderProps extends ReviewActions {
  name: string | null;
  /** Confianza del match en 0..1. */
  confidence: number;
  method: string;
  locale: Locale;
  /** Contexto de la cola para el pager de posición. */
  queue: QueueContext;
}

export interface CandidatesSectionProps {
  /** Candidatos ya ordenados por score desc (los da el backend). */
  candidates: AdminReviewCandidateDto[];
  store: CandidateStoreValues;
  onApprove: (canonicalProductId: string) => void;
  disabled?: boolean;
}

export interface RejectPanelProps {
  onReject: (payload: { reasonCode: string; reasonNote: string }) => void;
  disabled?: boolean;
}

export interface ConfidenceDonutProps {
  /** Confianza del match en 0..1 (`AdminReviewDetailDto.confidence`). */
  confidence: number;
  /** Lado del donut en px (cuadrado). */
  size?: number;
  /** Grosor del anillo en unidades del viewBox (0..100). */
  strokeWidth?: number;
  className?: string;
}

export interface FieldDiffRowProps {
  /** Etiqueta del campo (Nombre/Marca/Tamaño). */
  label: string;
  /** Valor crudo del `store_product`. */
  storeValue: string | null;
  /** Valor del candidato canónico. */
  candidateValue: string | null;
  /** Muestra el subtexto "store ≠ candidato" cuando difiere. Off para valores largos (ej. Nombre). */
  showValues?: boolean;
  /** "size" compara por cantidad+unidad canónica (2 letras) y muestra la forma normalizada; "text"
   * (default) compara/​muestra el texto crudo (casefold+trim). */
  kind?: "text" | "size";
}
