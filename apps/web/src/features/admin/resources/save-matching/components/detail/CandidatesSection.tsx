import { Info } from "lucide-react";

import { CandidateCard } from "./CandidateCard";
import type { CandidatesSectionProps } from "./interfaces";

// Columna derecha del detalle: "CANDIDATOS RECOMENDADOS" con scroll horizontal SCOPED (el body de la
// página nunca hace scroll-x). Lista vacía → estado "sin candidatos", nunca un error (filas legacy o
// EAN-colisión pueden no tener candidatos). El orden por score desc lo garantiza el backend.
export function CandidatesSection({ candidates, store, onApprove, disabled }: CandidatesSectionProps) {
  return (
    <section className="flex min-w-0 flex-col gap-3 lg:h-full">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            Candidatos recomendados
          </h2>
          <Info className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          Ordenados por similitud (score)
        </span>
      </header>

      {candidates.length === 0 ? (
        <p className="rounded-2xl border border-black/5 bg-card p-6 text-sm text-muted-foreground dark:border-white/10" data-testid="no-candidates">
          Sin candidatos — no hay coincidencias sugeridas para comparar.
        </p>
      ) : (
        <div className="flex flex-1 items-stretch gap-4 overflow-x-auto pb-2 lg:min-h-0">
          {candidates.map((c, i) => (
            <CandidateCard
              key={c.canonical_product_id}
              candidate={c}
              store={store}
              rank={i + 1}
              onApprove={onApprove}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </section>
  );
}
