import type { SourceHealthDto } from "@cuadra/api-client";
import { MoreHorizontal, Pencil, Power } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { providerLogoByName } from "@/features/save/lib/provider-logos";

import { pauseSourceConfig, resumeSourceConfig } from "../api";

// Menú de acciones de una fuente (Editar / Pausar-Reanudar) — compartido entre la fila de la lista y
// la card. Patrón de íconos `**` (gotcha #11 de cuadra-save-admin: recolorea el `<path>` de Lucide en
// focus). Maneja el toggle de pausa + su error inline (funciona tanto en celda como en card).
export function SourceActionsMenu({
  source,
  onEdit,
  refresh,
}: {
  source: SourceHealthDto;
  onEdit: () => void;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPaused = source.health === "paused";

  const onTogglePause = async () => {
    setBusy(true);
    setError(null);
    const res = isPaused ? await resumeSourceConfig(source.id) : await pauseSourceConfig(source.id);
    setBusy(false);
    if (res.error) setError(isPaused ? "No se pudo reanudar." : "No se pudo pausar.");
    else await refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label={`Acciones de ${source.platform}`}
          className="flex size-8 items-center justify-center rounded-full border border-[#b7e36f] bg-[#daff9f] text-[#015442] hover:bg-[#cdf58a] disabled:opacity-50 dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={onEdit}
            className="focus:bg-orange-500/10 focus:text-orange-600 not-data-[variant=destructive]:focus:**:text-orange-500 dark:focus:text-orange-400 dark:not-data-[variant=destructive]:focus:**:text-orange-400"
          >
            <Pencil className="text-orange-500" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void onTogglePause()}
            className="focus:bg-blue-500/10 focus:text-blue-600 not-data-[variant=destructive]:focus:**:text-blue-600 dark:focus:text-blue-400 dark:not-data-[variant=destructive]:focus:**:text-blue-400"
          >
            <Power className="text-blue-600 dark:text-blue-400" />
            {isPaused ? "Reanudar" : "Pausar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Logo del proveedor: `logo_url` del backend → logo bundleado por nombre (Bravo/Nacional/Sirena…) →
// placeholder con la inicial. Reusado en la card y la fila de la lista.
export function SourceLogo({ source, size = 36 }: { source: SourceHealthDto; size?: number }) {
  const label = source.provider_name || source.platform;
  const logo = source.logo_url ?? providerLogoByName(source.provider_name);
  return logo ? (
    <img
      src={logo}
      alt=""
      loading="lazy"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-xl object-contain"
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold text-muted-foreground"
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}
