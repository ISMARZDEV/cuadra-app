import type { CategorySuggestionDto, TaxonomyLeafDto } from "@cuadra/api-client";
import { Check, Search, Sparkles } from "lucide-react";
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
          <Sparkles className="size-4 text-brand-forest dark:text-brand-lime" aria-hidden="true" />
          <h4 className="text-sm font-semibold">
            {t("admin.canonicalDetail.category.suggestions")}
          </h4>
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
                        <span className="block text-sm font-medium">{s.name}</span>
                        {/* La señal de origen: sin esto la sugerencia es una caja negra. */}
                        <span className="block text-xs text-muted-foreground">
                          {t("admin.canonicalDetail.category.because")}{" "}
                          <span className="font-mono">{s.matched_tokens.join(", ")}</span>{" "}
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
        <h4 className="text-sm font-semibold">{t("admin.canonicalDetail.category.all")}</h4>
        <div className="relative flex h-9 items-center gap-2 rounded-full border border-[#8daeae]/40 bg-[#b0b0b0]/15 pr-1.5 pl-3 dark:border-white/10 dark:bg-white/5">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
                    active ? "bg-brand-lime/15 font-medium" : "hover:bg-muted",
                    busy && "opacity-50",
                  )}
                >
                  <span className="truncate">
                    <span className="text-muted-foreground">{leaf.top_name} › </span>
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
      </section>
    </div>
  );
}
