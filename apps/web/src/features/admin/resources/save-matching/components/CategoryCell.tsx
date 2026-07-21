import type { CategoryRefDto, TaxonomyLeafDto } from "@cuadra/api-client";
import { useState } from "react";

import { CategoryBadge } from "@/features/admin/components/CategoryBadge";
import { type Locale } from "@/i18n/config";
import { translate } from "@/i18n/messages";

import { CategoryPicker } from "./CategoryPicker";

/**
 * Celda de Categoría EDITABLE en la tabla de la cola.
 *
 * Es la pieza que decide si el flujo de siembra duele o no. La clasificación automática deja huecos
 * A PROPÓSITO (banda gris, conflicto de señales, sin etapa vectorial), así que llenarlos a mano es
 * el caso NORMAL, no la excepción — y la interacción más repetida del flujo.
 *
 * Por eso vive en la CELDA y no en un modal: el modal tapa justo lo que hace falta para decidir
 * (imagen, marca y tamaño están en la fila), y mandar al operador a otra pantalla rompe la
 * selección que traía.
 *
 * El badge ES el disparador: sin eso, un "Sin categoría" se lee como un dato que falta en vez de
 * como algo que se puede arreglar acá mismo. La interacción la aporta `CategoryPicker`, compartida
 * con las filas del diálogo de canonización; lo propio de esta celda es la PERSISTENCIA.
 */
export function CategoryCell({
  storeProductId,
  category,
  leaves,
  onSet,
  locale,
}: {
  storeProductId: string;
  category: CategoryRefDto | null | undefined;
  leaves: TaxonomyLeafDto[];
  /** Persiste la categoría. `false` = el servidor la rechazó → la celda revierte. */
  onSet: (storeProductId: string, taxonomyNodeId: string) => Promise<boolean>;
  locale: Locale;
}) {
  // Valor OPTIMISTA: lo que la celda muestra ahora. `undefined` = todavía manda el prop.
  const [optimistic, setOptimistic] = useState<CategoryRefDto | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const shown = optimistic !== undefined ? optimistic : category;

  const pick = async (leaf: TaxonomyLeafDto) => {
    const previous = shown;
    // Optimista: la celda es la interacción más repetida del flujo (diez correcciones seguidas), y
    // esperar el round-trip en cada una la volvería lenta justo donde tiene que ser barata. Va CON
    // el slug del tope para que el color sea el definitivo desde el primer frame: sin él saldría
    // gris y cambiaría al refrescar, un parpadeo que se lee como si algo hubiera fallado.
    setOptimistic({ slug: leaf.top_slug, name: leaf.top_name });
    setBusy(true);
    const ok = await onSet(storeProductId, leaf.id);
    setBusy(false);
    if (!ok) {
      // Un optimismo que no se deshace es una mentira: la celda diría una cosa y la DB otra.
      setOptimistic(previous);
    }
  };

  return (
    <CategoryPicker
      leaves={leaves}
      selectedTopName={shown?.name}
      onPick={(leaf) => void pick(leaf)}
      disabled={busy}
      label={translate(locale, "admin.reviewQueue.category.edit")}
      locale={locale}
    >
      <CategoryBadge slug={shown?.slug} name={shown?.name} locale={locale} />
    </CategoryPicker>
  );
}
