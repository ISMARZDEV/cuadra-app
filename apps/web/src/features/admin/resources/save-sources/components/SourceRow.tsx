import type { SourceHealthDto } from "@cuadra/api-client";

import { TableCell, TableRow } from "@/components/ui-base/table";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";

import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { formatLastSeen, formatRelativeAge, SOURCES_LOCALE } from "../lib/format-freshness";
import { platformLabel } from "../types";
import { HealthBadge } from "./HealthBadge";
import { SourceActionsMenu, SourceLogo } from "./SourceActionsMenu";

// Fila de la consola de Fuentes (vista lista) — fiel a `BasketRow`: checkbox, badge de salud, logo +
// plataforma, Base URL, y el menú de acciones compartido (Editar / Pausar).
export function SourceRow({
  source,
  selected,
  onToggleSelect,
  onEdit,
  refresh,
  t,
  locale,
}: {
  source: SourceHealthDto;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  refresh: () => Promise<void>;
  t: (key: MessageKey) => string;
  locale: Locale;
}) {
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className="border-border/60 data-[state=selected]:bg-brand-lime/10"
    >
      <TableCell>
        <SelectCheckbox
          checked={selected}
          onChange={onToggleSelect}
          aria-label={format(locale, "admin.sources.row.select", { name: source.platform })}
        />
      </TableCell>

      <TableCell>
        <HealthBadge health={source.health} t={t} />
      </TableCell>

      <TableCell>
        <SourceLogo source={source} size={40} />
      </TableCell>

      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {source.provider_name || platformLabel(source.platform)}
          </p>
          <p className="text-xs text-muted-foreground">{platformLabel(source.platform)}</p>
        </div>
      </TableCell>

      <TableCell>
        <span className="text-sm text-muted-foreground">{source.base_url}</span>
      </TableCell>

      <TableCell>
        <span className="tabular-nums text-sm text-foreground">{source.product_count ?? 0}</span>
      </TableCell>

      <TableCell>
        <div className="min-w-0">
          <p className="text-sm text-foreground">{formatRelativeAge(source.last_seen_at, SOURCES_LOCALE)}</p>
          <p className="text-xs text-muted-foreground">{formatLastSeen(source.last_seen_at, SOURCES_LOCALE)}</p>
        </div>
      </TableCell>

      <TableCell>
        <SourceActionsMenu source={source} onEdit={onEdit} refresh={refresh} t={t} locale={locale} />
      </TableCell>
    </TableRow>
  );
}
