import type { ProviderDto, SourcePlatform } from "@cuadra/api-client";

import { TableCell, TableRow } from "@/components/ui-base/table";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { platformLabel } from "../types";
import { ProviderActionsMenu } from "./ProviderActionsMenu";

// Color por plataforma. Existe para que el operador distinga de un vistazo qué adapter alimenta cada
// cadena — es el dato que decide a quién culpar cuando una ingesta falla. Los tonos son suaves a
// propósito: son etiquetas de clasificación, no estados de alarma.
const PLATFORM_TONE: Record<string, string> = {
  vtex: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  magento: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  shopify: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  rest_catalog: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  aggregator: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  spa: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
};

function platformTone(platform: SourcePlatform): string {
  return PLATFORM_TONE[platform] ?? PLATFORM_TONE.spa;
}

export function ProviderRow({
  provider,
  selected,
  onToggleSelect,
  onEdit,
  refresh,
  t,
  locale,
}: {
  provider: ProviderDto;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  refresh: () => Promise<void>;
  t: (key: MessageKey) => string;
  locale: Locale;
}) {
  const isArchived = Boolean(provider.archived_at);

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      // El archivado se atenúa en vez de ocultarse: solo aparece cuando se piden explícitamente, y
      // ahí tiene que leerse distinto del activo o el filtro no comunicaría nada.
      className={cn(selected && "bg-brand-lime/10", isArchived && "opacity-55")}
    >
      <TableCell className="w-10">
        <SelectCheckbox
          aria-label={provider.name}
          checked={selected}
          onChange={onToggleSelect}
        />
      </TableCell>

      <TableCell className="w-16">
        {/* `ProviderLogo` (= `ProviderBadge`) cae a un logo bundleado por nombre y, si tampoco,
            al nombre como texto — nunca deja un hueco. No acepta `size`: se dimensiona por clase. */}
        <ProviderLogo
          name={provider.name}
          logoUrl={provider.logo_url ?? null}
          className="max-h-8 max-w-20 object-contain"
        />
      </TableCell>

      <TableCell className="font-medium text-foreground">{provider.name}</TableCell>

      <TableCell>
        <span className="inline-flex items-center rounded-full bg-brand-forest/10 px-2 py-0.5 text-xs font-semibold text-brand-forest dark:bg-white/10 dark:text-white">
          {provider.market_id}
        </span>
      </TableCell>

      <TableCell>
        <span className="inline-flex items-center rounded-full bg-brand-lime/20 px-2 py-0.5 text-xs font-semibold text-brand-forest dark:text-brand-lime">
          {provider.type}
        </span>
      </TableCell>

      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
            platformTone(provider.platform),
          )}
        >
          {platformLabel(provider.platform)}
        </span>
      </TableCell>

      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              isArchived ? "bg-muted-foreground/50" : "bg-emerald-500",
            )}
          />
          {t(isArchived ? "admin.providers.status.archived" : "admin.providers.status.active")}
        </span>
      </TableCell>

      <TableCell>
        <ProviderActionsMenu
          provider={provider}
          onEdit={onEdit}
          refresh={refresh}
          t={t}
          locale={locale}
        />
      </TableCell>
    </TableRow>
  );
}
