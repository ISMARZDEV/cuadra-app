import { Check, ImageOff, Star } from "lucide-react";

import { FieldDiffRow } from "./FieldDiffRow";
import type { CandidateCardProps } from "./interfaces";

// Chip del ranking (1..N) y badge "MEJOR CANDIDATO" — módulo-scope (regla `no-inline-components`).
function RankChip({ rank }: { rank: number }) {
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
      {rank}
    </span>
  );
}

function BestCandidateBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
      <Star className="size-3.5 fill-current" aria-hidden="true" />
      Mejor candidato
    </span>
  );
}

// Card de un candidato canónico en el rediseño del detalle. Compone `FieldDiffRow` para el diff de
// Nombre/Marca/Tamaño (el Tamaño ahora compara contra `candidate.size_text` real). El realce del mejor
// candidato se DERIVA de `rank === 1` (sin boolean-prop extra) y se compone con `BestCandidateBadge`
// + un ring, no ramifica la card. Imagen con espacio reservado + `loading="lazy"` (CLS).
export function CandidateCard({ candidate, store, rank, onApprove, disabled }: CandidateCardProps) {
  const isBest = rank === 1;
  const scorePct = Math.round(candidate.score * 100);

  return (
    <div
      className={`flex h-full w-64 shrink-0 flex-col gap-3 rounded-2xl bg-card p-3 shadow-sm ${
        isBest ? "border-2 border-emerald-500" : "border border-black/5 dark:border-white/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RankChip rank={rank} />
          {isBest ? <BestCandidateBadge /> : null}
        </div>
        <div className="text-right leading-tight">
          <span className="text-base font-bold tabular-nums text-foreground">{scorePct}%</span>
          <span className="block text-[10px] font-medium text-muted-foreground">Score</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {candidate.image_url ? (
          <img
            src={candidate.image_url}
            alt={candidate.name ?? "Candidato"}
            loading="lazy"
            width={80}
            height={80}
            className="size-20 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div
            className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            role="img"
            aria-label="Sin imagen"
          >
            <ImageOff className="size-6" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {candidate.name ?? "(sin nombre)"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{candidate.brand ?? "N/A"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldDiffRow label="Nombre" storeValue={store.name} candidateValue={candidate.name ?? null} />
        <FieldDiffRow
          label="Marca"
          storeValue={store.brand}
          candidateValue={candidate.brand ?? null}
          showValues
        />
        <FieldDiffRow
          label="Tamaño"
          storeValue={store.sizeText}
          candidateValue={candidate.size_text ?? null}
          kind="size"
          showValues
        />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onApprove(candidate.canonical_product_id)}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-brand-forest px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-forest/90 focus-visible:ring-2 focus-visible:ring-brand-forest/50 focus-visible:ring-offset-1 disabled:opacity-50 dark:bg-brand-lime dark:text-brand-forest dark:hover:bg-brand-lime/90"
      >
        <Check className="size-4" aria-hidden="true" />
        Aprobar candidato
      </button>
    </div>
  );
}
