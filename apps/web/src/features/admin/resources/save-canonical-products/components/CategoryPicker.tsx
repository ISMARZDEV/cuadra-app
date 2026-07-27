import type {
  CategorySuggestionDto,
  TaxonomyLeafDto,
} from "@cuadra/api-client";
import { Check, ChevronDown, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

interface CategoryPickerProps {
  /** Hoja asignada hoy; `null` = sin categoría. */
  currentId: string | null;
  suggestions: CategorySuggestionDto[];
  leaves: TaxonomyLeafDto[];
  onPick: (taxonomyNodeId: string) => void;
  busy?: boolean;
  t: (key: MessageKey) => string;
}

/**
 * Selector de categoría con SUGERENCIAS primero y el árbol completo como fallback (US-CP-D2c).
 * Reutilizable a propósito: el detalle y la asignación en lote (US-CP-L10) tienen que ofrecer
 * exactamente la misma decisión, o el operador aprendería dos flujos para la misma tarea.
 *
 * Dos reglas del clasificador que este componente respeta:
 * 1. **Nunca inventa.** Sin señal léxica no hay sugerencias — se muestra el aviso y el árbol, en
 *    vez de proponer la primera hoja "por si acaso".
 * 2. **La sugerencia INFORMA, el humano DECIDE.** Por eso cada una muestra los tokens que la
 *    dispararon: es una decisión informada, no una caja negra que hay que creerle.
 */
export function CategoryPicker({
  currentId,
  suggestions,
  leaves,
  onPick,
  busy = false,
  t,
}: CategoryPickerProps) {
  const [query, setQuery] = useState("");
  /** El árbol arranca abierto SÓLO si todavía no hay categoría: ahí es la tarea. Con una ya
   * asignada, es ruido sobre una decisión tomada y se abre a pedido. */
  const [treeOpen, setTreeOpen] = useState(!currentId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return leaves;
    return leaves.filter((l) =>
      `${l.top_name} ${l.name}`.toLowerCase().includes(needle),
    );
  }, [leaves, query]);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles
            className="size-4 text-brand-forest dark:text-brand-lime"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold">
            {t("admin.canonicalDetail.category.suggestions")}
          </h3>
        </div>

        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("admin.canonicalDetail.category.noSuggestions")}
          </p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {suggestions.map((s) => {
                const active = s.taxonomy_node_id === currentId;
                return (
                  <li key={s.taxonomy_node_id}>
                    <button
                      type="button"
                      disabled={busy || active}
                      onClick={() => onPick(s.taxonomy_node_id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-brand-lime bg-brand-lime/15"
                          : "border-border hover:bg-muted",
                        busy && "opacity-50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {s.name}
                        </span>
                        {/* La señal de origen: sin esto la sugerencia es una caja negra. */}
                        <span className="block text-xs text-muted-foreground">
                          {t("admin.canonicalDetail.category.because")}{" "}
                          <span className="font-mono">
                            {s.matched_tokens.join(", ")}
                          </span>{" "}
                          ({t("admin.canonicalDetail.category.signal.lexicon")})
                        </span>
                      </span>
                      {active ? (
                        <Check
                          className="size-4 shrink-0 text-brand-forest dark:text-brand-lime"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("admin.canonicalDetail.category.suggestionsHint")}
            </p>
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {t("admin.canonicalDetail.category.all")}
          </h3>
          {/* Divulgación progresiva: si el producto YA tiene categoría, el árbol es ruido sobre una
              decisión tomada — mostraba siete entradas de "Alcohol >" en un producto de arroz. Si
              no la tiene, el árbol ES la tarea y esconderlo sería un click de peaje. */}
          {currentId ? (
            <button
              type="button"
              onClick={() => setTreeOpen((v) => !v)}
              aria-expanded={treeOpen}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-brand-forest hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:text-brand-lime"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  treeOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
              {t(
                treeOpen
                  ? "admin.canonicalDetail.category.hideTree"
                  : "admin.canonicalDetail.category.showTree",
              )}
            </button>
          ) : null}
        </div>

        {treeOpen ? (
          <>
            {/* El pill de alrededor es el que muestra el foco (el `Input` de adentro anula su propio
            anillo para no dibujar dos). Sin este `focus-within` el foco quedaba INVISIBLE: el
            campo se enfocaba y nada lo indicaba. Mismo anillo de 3px que el resto del sistema. */}
            <div className="relative flex h-9 items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:border-white/10 dark:bg-white/5">
              <Search
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("admin.canonicalDetail.category.search")}
                aria-label={t("admin.canonicalDetail.category.search")}
                className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>

            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {filtered.map((leaf) => {
                const active = leaf.id === currentId;
                return (
                  <li key={leaf.id}>
                    <button
                      type="button"
                      disabled={busy || active}
                      onClick={() => onPick(leaf.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                        active
                          ? "bg-brand-lime/15 font-medium"
                          : "hover:bg-muted",
                        busy && "opacity-50",
                      )}
                    >
                      <span className="truncate">
                        <span className="text-muted-foreground">
                          {leaf.top_name} ›{" "}
                        </span>
                        {leaf.name}
                      </span>
                      {active ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("admin.canonicalDetail.category.current")}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
