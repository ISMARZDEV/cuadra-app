import type { ProviderDto } from "@cuadra/api-client";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { ConfirmDialog } from "@/features/admin/components/ConfirmDialog";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { archiveProvider, unarchiveProvider } from "../api";

// Menú de acciones de un proveedor (Editar / Archivar-Restaurar). Patrón de íconos `**` (gotcha #11
// de cuadra-save-admin: Lucide pinta con `currentColor`, así que el color efectivo es el del
// `<path>`, no el del `<svg>`; `[&_svg]` recolorea el wrapper y el path se queda gris).
//
// Archivar pide ConfirmDialog; restaurar NO. La asimetría es deliberada: archivar saca al proveedor
// de la ingesta —deja de recogerse precio de esa cadena— y eso merece una parada. Restaurar solo
// deshace, y poner fricción a deshacer castiga a quien está corrigiendo un error.
export function ProviderActionsMenu({
  provider,
  onEdit,
  refresh,
  t,
  locale,
}: {
  provider: ProviderDto;
  onEdit: () => void;
  refresh: () => Promise<void>;
  t: (key: MessageKey) => string;
  locale: Locale;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const isArchived = Boolean(provider.archived_at);

  const applyArchive = async (archived: boolean) => {
    setBusy(true);
    setError(null);
    // `finally`: si la promesa RECHAZA, un `setBusy(false)` suelto no corre y el menú de la fila
    // queda bloqueado hasta recargar la página.
    try {
      const res = archived
        ? await archiveProvider(provider.id)
        : await unarchiveProvider(provider.id);
      setConfirming(false);
      if (res.error) setError(t("admin.providers.actions.errArchive"));
      else await refresh();
    } catch {
      setError(t("admin.providers.actions.errArchive"));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Centrado en la celda, alineado con su encabezado. Con `items-end` (heredado de
    // `SourceActionsMenu`) el botón se pegaba al borde derecho y, como la última columna absorbe el
    // ancho sobrante de la tabla, quedaba un hueco enorme entre el título "Acciones" y los botones.
    <div className="flex flex-col items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label={format(locale, "admin.providers.actions.aria", { name: provider.name })}
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
            {t("admin.providers.actions.edit")}
          </DropdownMenuItem>

          {isArchived ? (
            <DropdownMenuItem
              onClick={() => void applyArchive(false)}
              className="focus:bg-blue-500/10 focus:text-blue-600 not-data-[variant=destructive]:focus:**:text-blue-600 dark:focus:text-blue-400 dark:not-data-[variant=destructive]:focus:**:text-blue-400"
            >
              <ArchiveRestore className="text-blue-600 dark:text-blue-400" />
              {t("admin.providers.actions.unarchive")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
              <Archive />
              {t("admin.providers.actions.archive")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={format(locale, "admin.providers.archive.title", { name: provider.name })}
        description={t("admin.providers.archive.description")}
        confirmLabel={t("admin.providers.archive.confirm")}
        cancelLabel={t("admin.providers.modal.cancel")}
        onConfirm={() => void applyArchive(true)}
        destructive
        busy={busy}
      />
    </div>
  );
}
