import type { SourceHealthDto } from "@cuadra/api-client";

import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";

import { formatLastSeen, formatRelativeAge, SOURCES_LOCALE } from "../lib/format-freshness";
import { platformLabel } from "../types";
import { HealthBadge } from "./HealthBadge";
import { SourceActionsMenu, SourceLogo } from "./SourceActionsMenu";

// Card de una fuente (vista grid) — logo del proveedor + plataforma + Base URL + badge de salud +
// checkbox de selección + menú de acciones. Mismo lenguaje visual redondeado del marketplace / admin.
export function SourceCard({
  source,
  selected,
  onToggleSelect,
  onEdit,
  refresh,
}: {
  source: SourceHealthDto;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  refresh: () => Promise<void>;
}) {
  return (
    <div
      data-state={selected ? "selected" : undefined}
      className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm data-[state=selected]:ring-2 data-[state=selected]:ring-brand-lime dark:border-white/10 dark:bg-card"
    >
      <div className="flex items-start gap-3">
        <SelectCheckbox
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Seleccionar ${source.provider_name || platformLabel(source.platform)}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {source.provider_name || platformLabel(source.platform)}
          </p>
          <p className="text-xs text-muted-foreground">{platformLabel(source.platform)}</p>
        </div>
        <SourceActionsMenu source={source} onEdit={onEdit} refresh={refresh} />
      </div>

      <a
        href={source.base_url}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-sm text-muted-foreground hover:text-brand-forest dark:hover:text-brand-lime"
      >
        {source.base_url}
      </a>

      {/* Frescura: nº de productos + antigüedad (contexto del badge de salud) */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <span className="tabular-nums font-medium text-foreground">{source.product_count ?? 0}</span> productos
        </span>
        <span title={formatLastSeen(source.last_seen_at, SOURCES_LOCALE)}>
          {formatRelativeAge(source.last_seen_at, SOURCES_LOCALE)}
        </span>
      </div>

      {/* Pie: badge de salud (izq) + logo del proveedor en la esquina (der) */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <HealthBadge health={source.health} />
        <SourceLogo source={source} size={60} />
      </div>
    </div>
  );
}
