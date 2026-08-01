import { Dialog } from "@base-ui/react/dialog";
import type {
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
  TaxonomyLeafDto,
} from "@cuadra/api-client";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Link2,
  MoreHorizontal,
  PackagePlus,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui-base/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/features/admin/components/CategoryBadge";
import { ProductPhoto } from "@/features/admin/components/ProductPhoto";
import { PRODUCT_CANVAS_BG } from "@/features/admin/lib/product-surfaces";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { CategoryPicker } from "@/features/admin/resources/save-matching/components/CategoryPicker";
import { ReasonCodeSelect } from "@/features/admin/resources/save-matching/components/ReasonCodeSelect";
import { formatMoney } from "@/features/save/lib/format";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { listCanonicalProducts } from "../api";

type T = (key: MessageKey) => string;

/** Qué diálogo está abierto. `null` = ninguno; el menú NO abre nada por sí solo. */
type OpenAction = "discard" | "unlink" | "relink" | "promote" | null;

/**
 * El menú de acciones de UNA fila de "Proveedores matcheados", con sus cuatro operaciones sobre el
 * matcheo de ese proveedor.
 *
 * Está aparte de `ProvidersPanel` a propósito: el panel es una TABLA (buscar, paginar, resumir) y
 * esto es una MÁQUINA DE ESTADOS de diálogos. Mezclarlas dejaría un componente con dos razones para
 * cambiar y siete `useState` que no se hablan entre sí.
 *
 * ORDEN Y SEPARACIÓN DEL MENÚ, que no es cosmético. Las tres acciones reversibles van arriba;
 * "Eliminar permanentemente" va abajo del separador y en rojo, porque es la única IRREVERSIBLE. Un
 * menú donde el borrado duro está pegado a "Abrir" invita al clic equivocado.
 *
 * NINGUNA acción se ejecuta desde el menú. Las cuatro abren un diálogo primero — incluso las
 * reversibles, porque las tres cambian a qué canónico pertenece un precio que el sitio público ya
 * está mostrando.
 */
export function ProviderRowActions({
  canonicalProductId,
  row,
  leaves,
  locale,
  t,
  decidedBy,
  onDone,
  onDiscard,
  onUnlink,
  onRelink,
  onPromote,
}: {
  canonicalProductId: string;
  row: AdminCanonicalProviderPriceDto;
  /** Hojas de la taxonomía para el canónico nuevo (#4). Vacío = el picker queda deshabilitado. */
  leaves: TaxonomyLeafDto[];
  locale: Locale;
  t: T;
  /** Quién decide — va al `decided_by` de la auditoría. */
  decidedBy: string;
  /** Refresca la tabla después de una mutación exitosa. */
  onDone: () => void;
  onDiscard: (storeProductId: string) => Promise<{ deleted_price_count: number } | null>;
  onUnlink: (
    storeProductId: string,
    body: { reason_code: string; reason_note: string | null },
  ) => Promise<void>;
  onRelink: (storeProductId: string, canonicalProductId: string) => Promise<void>;
  /** Solo la categoría: el resto lo deriva el servidor del store_product. */
  onPromote: (storeProductId: string, taxonomyNodeId: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState<OpenAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(null);
    setError(null);
  };

  /** Envuelve una mutación: bloquea, captura el error EN el diálogo y solo cierra si salió bien. */
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
      setOpen(null);
    } catch (e) {
      // El error se muestra DENTRO del diálogo y este queda abierto: cerrarlo perdería lo que el
      // operador escribió y lo dejaría sin saber si la acción se aplicó.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("admin.canonicalDetail.providers.col.actions")}
          className="flex size-8 items-center justify-center rounded-full border border-[#b7e36f] bg-[#daff9f] text-[#015442] hover:bg-[#cdf58a] dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        {/* Mismo menú coloreado que la lista canónica y la Cola de revisión (`CanonicalProductRow`):
            cada acción lleva su color en el ícono y tiñe su fondo al resaltarse. No es adorno — el
            color es lo que hace la acción reconocible SIN leer, y en un menú de cinco entradas donde
            una destruye datos eso importa.

            El override usa `**` (todos los descendientes) y NO `[&_svg]`: los íconos Lucide dibujan
            con stroke="currentColor", así que el color real lo decide el `color` del <path> interno.

            Los tonos siguen el vocabulario ya establecido en la consola:
              · azul     → abrir algo externo (igual que "ver en el sitio público")
              · ámbar    → vuelve a requerir atención humana (la cola de revisión)
              · violeta  → relación con canónicos/proveedores
              · esmeralda→ crear / restaurar
              · destructivo → el rojo lo pone el `variant`, no clases a mano */}
        <DropdownMenuContent align="end" className="min-w-60 [&_[role=menuitem]]:whitespace-nowrap">
          <DropdownMenuItem
            disabled={!row.url}
            onClick={() => row.url && window.open(row.url, "_blank", "noopener,noreferrer")}
            className="focus:bg-blue-500/10 focus:text-blue-600 not-data-[variant=destructive]:focus:**:text-blue-600 dark:focus:text-blue-400 dark:not-data-[variant=destructive]:focus:**:text-blue-400"
          >
            <ExternalLink className="text-blue-600 dark:text-blue-400" />
            {t("admin.canonicalProducts.providers.open")}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setOpen("unlink")}
            className="focus:bg-amber-500/10 focus:text-amber-600 not-data-[variant=destructive]:focus:**:text-amber-600 dark:focus:text-amber-400 dark:not-data-[variant=destructive]:focus:**:text-amber-400"
          >
            <Undo2 className="text-amber-600 dark:text-amber-400" />
            {t("admin.canonicalDetail.providers.actions.unlink")}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setOpen("relink")}
            className="focus:bg-violet-500/10 focus:text-violet-600 not-data-[variant=destructive]:focus:**:text-violet-600 dark:focus:text-violet-400 dark:not-data-[variant=destructive]:focus:**:text-violet-400"
          >
            <Link2 className="text-violet-600 dark:text-violet-400" />
            {t("admin.canonicalDetail.providers.actions.relink")}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setOpen("promote")}
            className="focus:bg-emerald-500/10 focus:text-emerald-600 not-data-[variant=destructive]:focus:**:text-emerald-600 dark:focus:text-emerald-400 dark:not-data-[variant=destructive]:focus:**:text-emerald-400"
          >
            <PackagePlus className="text-emerald-600 dark:text-emerald-400" />
            {t("admin.canonicalDetail.providers.actions.promote")}
          </DropdownMenuItem>

          {/* El separador se queda: es la única entrada IRREVERSIBLE del menú y el `variant`
              destructivo por sí solo no la separa físicamente del resto. */}
          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onClick={() => setOpen("discard")}>
            <Trash2 />
            {t("admin.canonicalDetail.providers.actions.discard")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DiscardDialog
        open={open === "discard"}
        onClose={close}
        row={row}
        locale={locale}
        t={t}
        busy={busy}
        error={error}
        onConfirm={() => run(() => onDiscard(row.store_product_id))}
      />

      <UnlinkDialog
        open={open === "unlink"}
        onClose={close}
        row={row}
        t={t}
        busy={busy}
        error={error}
        onConfirm={(body) => run(() => onUnlink(row.store_product_id, body))}
      />

      <RelinkDialog
        open={open === "relink"}
        onClose={close}
        row={row}
        currentCanonicalId={canonicalProductId}
        t={t}
        busy={busy}
        error={error}
        onConfirm={(targetId) => run(() => onRelink(row.store_product_id, targetId))}
      />

      <PromoteDialog
        open={open === "promote"}
        onClose={close}
        row={row}
        leaves={leaves}
        locale={locale}
        t={t}
        busy={busy}
        error={error}
        onConfirm={(taxonomyNodeId) => run(() => onPromote(row.store_product_id, taxonomyNodeId))}
      />
    </>
  );
}

// ------------------------------------------------------------------------------ chrome compartido

function Shell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  error,
  closeLabel,
  tone = "neutral",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Etiqueta accesible del botón de cerrar, ya traducida (Shell no recibe `t`). */
  closeLabel: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
  error: string | null;
  tone?: "neutral" | "danger";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between gap-3 px-6 pt-5">
            <Dialog.Title
              className={
                tone === "danger"
                  ? "text-lg font-bold text-red-600 dark:text-red-400"
                  : "text-lg font-bold text-brand-forest dark:text-brand-lime"
              }
            >
              {title}
            </Dialog.Title>
            {/* El foco inicial del diálogo cae acá (es el primer focusable), así que SIN un
                `focus-visible` propio el navegador dibuja su anillo azul por defecto: lo más
                ruidoso del modal terminaba siendo la acción menos importante, y en azul, que en
                esta consola significa "abrir algo externo". El anillo NO se quita —un usuario de
                teclado tiene que ver dónde está— se estila con el verde del sistema. */}
            <Dialog.Close
              aria-label={closeLabel}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {description ? (
            <Dialog.Description className="px-6 pt-2 text-sm text-muted-foreground">
              {description}
            </Dialog.Description>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>

          {error ? (
            <p
              role="alert"
              className="mx-6 mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * El producto de la TIENDA sobre el que se está actuando: foto, nombre, los dos campos derivados y
 * su procedencia (cadena + precio).
 *
 * Compartido entre "crear canónico nuevo" y "matchear con otro canónico" porque en los dos el
 * operador necesita lo MISMO: ver qué está moviendo antes de decidir a dónde. En el de rematcheo su
 * ausencia era un hueco real — se elegía un destino entre doce candidatos parecidos sin tener
 * delante el producto de origen, o sea comparando contra la memoria.
 *
 * Está extraído (y no duplicado) para que las dos superficies no se bifurquen: el par lienzo/tarjeta
 * de las fotos y el trato del nombre en mayúsculas son reglas del sistema, no de un diálogo.
 */
function SourceProductCard({
  row,
  t,
}: {
  row: AdminCanonicalProviderPriceDto;
  t: T;
}) {
  return (
    <div className="flex items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-card">
      {/* LIENZO GRIS alrededor de la foto (`PRODUCT_CANVAS_BG`). No es relleno decorativo: el par
          lienzo `#F4F6F7` + tarjeta `#FDFFFF` de `product-surfaces.ts` ES el mecanismo que le da
          contorno a una foto de producto — las tiendas las publican recortadas sobre blanco, así que
          sin el gris detrás la foto se derrama sobre la tarjeta y no se ve dónde termina.
          El gris es FIJO en claro y oscuro, por eso vive en un recuadro propio y no tiñe el texto de
          al lado, que sí sigue el tema. */}
      <div
        style={{ backgroundColor: PRODUCT_CANVAS_BG }}
        className="flex shrink-0 items-center justify-center p-2.5"
      >
        <ProductPhoto
          src={row.store_product_image_url}
          alt={row.store_product_name ?? row.provider_name}
          emptyLabel={t("admin.canonicalDetail.providers.dialog.noPhoto")}
          className="size-16 rounded-lg"
        />
      </div>

      <div className="min-w-0 flex-1 py-2.5 pr-3">
        {/* `tracking-tight` + `text-sm`: Bravo publica los nombres EN MAYÚSCULAS
            ("ARROZ SELECTO 10 LB"). La cadena se muestra tal como la informa la tienda —igual que en
            Auditoría, y cambiarla sería falsear el dato—, pero no hace falta AMPLIFICARLA: a
            `text-base` un nombre todo en caps se lee como un grito y desequilibra la tarjeta.
            Las mayúsculas además piden tracking negativo para no abrirse. */}
        {row.store_product_name ? (
          <p className="line-clamp-2 text-sm leading-snug font-semibold tracking-tight text-foreground">
            {row.store_product_name}
          </p>
        ) : (
          <p className="text-sm leading-snug font-semibold text-amber-700 dark:text-amber-400">
            {t("admin.canonicalDetail.providers.promote.noNameShort")}
          </p>
        )}

        {/* Marca y tamaño van ETIQUETADOS. Sin etiqueta, "10 Lb" debajo de "ARROZ SELECTO 10 LB" se
            lee como una repetición inútil; con ella se entiende que es el CAMPO tamaño. Y el guión
            hace visible que la tienda no informa marca, en vez de que el dato falte sin explicación. */}
        <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
          <div className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">
              {t("admin.canonicalDetail.providers.promote.fieldSize")}
            </dt>
            <dd className="font-medium text-foreground">{row.store_product_size_text || "—"}</dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">
              {t("admin.canonicalDetail.providers.promote.fieldBrand")}
            </dt>
            <dd className="font-medium text-foreground">{row.store_product_brand || "—"}</dd>
          </div>
        </dl>

        {/* PROCEDENCIA, en su propia zona tras una divisoria: arriba QUÉ producto es, abajo DE DÓNDE
            viene y a qué precio. */}
        <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2">
          <ProviderLogo
            name={row.provider_name}
            logoUrl={row.provider_logo_url}
            className="max-h-4 max-w-14 shrink-0 object-contain"
          />
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatMoney(row.price_minor, row.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- #1 · borrado duro

function DiscardDialog({
  open,
  onClose,
  row,
  locale,
  t,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  row: AdminCanonicalProviderPriceDto;
  locale: Locale;
  t: T;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  /**
   * Escribir el nombre de la tienda para confirmar. Es deliberadamente incómodo: es la única acción
   * del menú que destruye datos sin vuelta atrás, y un `¿estás seguro?` de un clic se acepta por
   * reflejo. Escribir obliga a LEER de qué tienda se trata.
   */
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const confirmed = typed.trim().toLowerCase() === row.provider_name.trim().toLowerCase();

  return (
    <Shell
      open={open}
      onClose={onClose}
      tone="danger"
      title={t("admin.canonicalDetail.providers.discard.title")}
      closeLabel={t("admin.canonicalDetail.providers.dialog.close")}
      error={error}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("admin.canonicalDetail.providers.dialog.cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy || !confirmed}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {t("admin.canonicalDetail.providers.discard.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl bg-red-50 p-3 dark:bg-red-500/10">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-red-700 dark:text-red-300">
              {t("admin.canonicalDetail.providers.discard.warning")}
            </p>
            {/* Se nombra el precio actual porque es lo que el operador tiene delante en la tabla:
                conecta la fila que está mirando con la fila que va a desaparecer. */}
            <p className="text-red-700/90 dark:text-red-300/90">
              {format(locale, "admin.canonicalDetail.providers.discard.detail", {
                provider: row.provider_name,
                price: formatMoney(row.price_minor, row.currency),
              })}
            </p>
          </div>
        </div>

        {/* La contrapartida buena: NO es un borrado que se pierde para siempre del sistema, solo del
            registro actual. Decirlo baja el miedo a usar la acción cuando corresponde. */}
        <p className="text-sm text-muted-foreground">
          {t("admin.canonicalDetail.providers.discard.reingest")}
        </p>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {format(locale, "admin.canonicalDetail.providers.discard.typeToConfirm", {
              provider: row.provider_name,
            })}
          </span>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={row.provider_name}
            aria-label={t("admin.canonicalDetail.providers.discard.typeToConfirmLabel")}
            className="h-9"
          />
        </label>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------- #2 · devolver a la cola

function UnlinkDialog({
  open,
  onClose,
  row,
  t,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  row: AdminCanonicalProviderPriceDto;
  t: T;
  busy: boolean;
  error: string | null;
  onConfirm: (body: { reason_code: string; reason_note: string | null }) => void;
}) {
  return (
    <Shell
      open={open}
      onClose={onClose}
      title={t("admin.canonicalDetail.providers.unlink.title")}
      closeLabel={t("admin.canonicalDetail.providers.dialog.close")}
      description={t("admin.canonicalDetail.providers.unlink.description")}
      error={error}
      footer={
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t("admin.canonicalDetail.providers.dialog.cancel")}
        </Button>
      }
    >
      {/* Reusa el selector de motivos de la Cola de revisión: mismos códigos, misma validación. Dos
          listas de motivos distintas para la misma decisión harían incomparables las estadísticas. */}
      <ReasonCodeSelect
        submitLabel={t("admin.canonicalDetail.providers.unlink.confirm")}
        onReject={({ reasonCode, reasonNote }) =>
          onConfirm({ reason_code: reasonCode, reason_note: reasonNote || null })
        }
      />
      <p className="mt-3 text-xs text-muted-foreground">
        {t("admin.canonicalDetail.providers.unlink.keepsHistory")}
      </p>
    </Shell>
  );
}

// --------------------------------------------------------------- #3 · rematchear a otro canónico

function RelinkDialog({
  open,
  onClose,
  row,
  currentCanonicalId,
  t,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  row: AdminCanonicalProviderPriceDto;
  currentCanonicalId: string;
  t: T;
  busy: boolean;
  error: string | null;
  onConfirm: (canonicalProductId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminCanonicalProductRowDto[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setResults([]);
      setPicked(null);
    }
  }, [open]);

  // Se busca en el SERVIDOR y con debounce: el catálogo canónico tiene miles de filas y traerlas
  // todas para filtrar en el cliente sería un payload enorme por un diálogo que se usa de a una vez.
  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const page = await listCanonicalProducts({ search: q, limit: 20 });
        if (alive) setResults(page?.rows ?? []);
      } finally {
        if (alive) setSearching(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [open, search]);

  // El canónico ACTUAL se excluye: "moverlo a donde ya está" no es una operación, y ofrecerlo solo
  // genera un no-op que el operador interpreta como que la acción falló.
  const options = useMemo(
    () => results.filter((r) => r.canonical_product_id !== currentCanonicalId),
    [results, currentCanonicalId],
  );

  return (
    <Shell
      open={open}
      onClose={onClose}
      title={t("admin.canonicalDetail.providers.relink.title")}
      closeLabel={t("admin.canonicalDetail.providers.dialog.close")}
      error={error}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {/* El bloqueo se explica, igual que en "crear canónico": un botón apagado y mudo obliga a
              adivinar qué falta. */}
          <p className="min-w-0 text-xs text-muted-foreground">
            {picked
              ? t("admin.canonicalDetail.providers.relink.willMove")
              : t("admin.canonicalDetail.providers.relink.blockedNoPick")}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t("admin.canonicalDetail.providers.dialog.cancel")}
            </Button>
            <Button onClick={() => picked && onConfirm(picked)} disabled={busy || !picked}>
              {t("admin.canonicalDetail.providers.relink.confirm")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* EL ORIGEN, ARRIBA. Elegir entre doce canónicos casi idénticos sin el producto de partida a
            la vista obliga a comparar contra la memoria — y el error acá mueve el precio de una
            tienda al producto equivocado. Es la misma tarjeta de "crear canónico": una sola
            definición para las dos superficies. */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">
            {t("admin.canonicalDetail.providers.relink.sourceLabel")}
          </p>
          <SourceProductCard row={row} t={t} />
        </div>

        {/* EL DESTINO. Rotulado aparte para que las dos mitades del diálogo no se confundan entre
            sí: arriba lo que se mueve, abajo a dónde va. Sin los rótulos, la tarjeta de origen se
            leería como un resultado más de la búsqueda. */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            {t("admin.canonicalDetail.providers.relink.targetLabel")}
          </label>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.canonicalDetail.providers.relink.searchPlaceholder")}
            aria-label={t("admin.canonicalDetail.providers.relink.searchPlaceholder")}
            className="h-9"
          />

          <div className="mt-2">
        {search.trim().length < 2 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("admin.canonicalDetail.providers.relink.typeMore")}
          </p>
        ) : searching ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("admin.canonicalDetail.providers.relink.searching")}
          </p>
        ) : options.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("admin.canonicalDetail.providers.relink.noResults")}
          </p>
        ) : (
          /* CON FOTO. Una búsqueda de "arroz" devuelve doce filas casi idénticas
             ("Arroz La Garza Premium 3 / 5 / 20 / 30 Lbs") y distinguirlas solo por texto obliga a
             leer y comparar cada una. La foto del canónico las separa de un vistazo — y acá el costo
             de elegir mal es mover el precio de una tienda al producto equivocado. */
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {options.map((option) => {
              const isPicked = picked === option.canonical_product_id;
              return (
                <li key={option.canonical_product_id}>
                  <button
                    type="button"
                    onClick={() => setPicked(option.canonical_product_id)}
                    aria-pressed={isPicked}
                    className={cn(
                      "flex w-full items-center gap-3 p-2.5 text-left transition-colors",
                      isPicked
                        ? "bg-brand-lime/25"
                        : "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                    )}
                  >
                    {/* Mismo lienzo gris que la tarjeta de origen: las fotos vienen recortadas sobre
                        blanco y sin el gris detrás no se ve dónde termina cada una. */}
                    <div
                      style={{ backgroundColor: PRODUCT_CANVAS_BG }}
                      className="flex shrink-0 items-center justify-center rounded-lg p-1"
                    >
                      <ProductPhoto
                        src={option.image_url}
                        alt={option.name}
                        emptyLabel={t("admin.canonicalDetail.providers.dialog.noPhoto")}
                        className="size-10 rounded-md"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{option.name}</p>
                      {/* Marca y tamaño son LO QUE DISTINGUE entre sí a estas filas, así que van
                          primero y legibles. La categoría se repite idéntica en las doce cuando la
                          búsqueda es por categoría, así que baja a un tono más apagado: sigue
                          estando, pero deja de competir con lo que sí diferencia. */}
                      <p className="truncate text-xs text-muted-foreground">
                        {[option.brand, option.display_size].filter(Boolean).join(" · ")}
                        {option.category ? (
                          <span className="text-muted-foreground/60"> · {option.category}</span>
                        ) : null}
                      </p>
                    </div>

                    {/* El check hace la selección INEQUÍVOCA. Solo el fondo lima se confunde con el
                        hover, y de cuál fila está elegida depende sobre qué canónico actúa el botón. */}
                    {isPicked ? (
                      <Check
                        className="size-4 shrink-0 text-brand-forest dark:text-brand-lime"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ----------------------------------------------------------- #4 · crear canónico nuevo desde este

/**
 * "Crear canónico nuevo desde este producto" — SIN formulario, solo una decisión.
 *
 * Nombre, marca y cantidad los deriva el SERVIDOR de los atributos crudos del propio store_product
 * (incluida la conversión "500 g" → unidad base, que es regla de dominio). Acá solo se elige la
 * CATEGORÍA, que es lo único que un humano tiene que decidir — exactamente el mismo criterio que el
 * diálogo en lote de la Cola de revisión.
 *
 * Se MUESTRA lo que el servidor va a derivar, aunque no sea editable: es la última pantalla antes de
 * una escritura en el catálogo maestro, y un diálogo que solo dice "elegí categoría" obligaría a
 * confiar a ciegas en qué producto se está promoviendo.
 */
function PromoteDialog({
  open,
  onClose,
  row,
  leaves,
  locale,
  t,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  row: AdminCanonicalProviderPriceDto;
  leaves: TaxonomyLeafDto[];
  locale: Locale;
  t: T;
  busy: boolean;
  error: string | null;
  onConfirm: (taxonomyNodeId: string) => void;
}) {
  const [leaf, setLeaf] = useState<TaxonomyLeafDto | null>(null);
  useEffect(() => {
    if (!open) setLeaf(null);
  }, [open]);

  return (
    <Shell
      open={open}
      onClose={onClose}
      title={t("admin.canonicalDetail.providers.promote.title")}
      closeLabel={t("admin.canonicalDetail.providers.dialog.close")}
      error={error}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {/* El BLOQUEO SE EXPLICA. Un botón apagado sin motivo obliga a adivinar; la voz del admin
              pide que los bloqueos digan por qué. Ocupa el hueco vacío que antes quedaba a la
              izquierda del pie, así que además arregla el ritmo vertical del modal. */}
          <p className="min-w-0 text-xs text-muted-foreground">
            {!row.store_product_name
              ? t("admin.canonicalDetail.providers.promote.noName")
              : !leaf
                ? t("admin.canonicalDetail.providers.promote.blockedNoCategory")
                : t("admin.canonicalDetail.providers.promote.keepsCurrent")}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t("admin.canonicalDetail.providers.dialog.cancel")}
            </Button>
            <Button
              disabled={busy || !leaf || !row.store_product_name}
              onClick={() => leaf && onConfirm(leaf.id)}
            >
              {t("admin.canonicalDetail.providers.promote.confirm")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <SourceProductCard row={row} t={t} />

        {/* LA ÚNICA DECISIÓN DEL MODAL, tratada como tal: etiqueta de campo arriba, disparador a lo
            ancho que se LEE como control (borde, chevron, hover) y texto de ayuda debajo. Antes era
            un pill ámbar inline junto a la palabra "Categoría" — y en esta consola el ámbar significa
            "falta un dato", así que el único control interactivo parecía un aviso pasivo. */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            {t("admin.canonicalDetail.providers.promote.category")}
          </label>
          <CategoryPicker
            leaves={leaves}
            selectedTopName={leaf?.name ?? null}
            onPick={setLeaf}
            disabled={leaves.length === 0}
            label={t("admin.canonicalDetail.providers.promote.category")}
            locale={locale}
          >
            <span
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                leaf
                  ? "border-border bg-card"
                  : "border-dashed border-amber-400/70 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-950/20",
              )}
            >
              {leaf ? (
                <CategoryBadge slug={leaf.top_slug} name={leaf.name} locale={locale} />
              ) : (
                <span className="text-sm text-amber-800 dark:text-amber-300">
                  {t("admin.canonicalDetail.providers.promote.pickCategory")}
                </span>
              )}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </CategoryPicker>

          <p className="mt-1.5 text-xs text-muted-foreground">
            {leaves.length === 0
              ? t("admin.canonicalDetail.providers.promote.noTaxonomy")
              : leaf
                ? format(locale, "admin.canonicalDetail.providers.promote.categoryPicked", {
                    top: leaf.top_name,
                  })
                : t("admin.canonicalDetail.providers.promote.categoryHint")}
          </p>
        </div>

        {/* Lo que el servidor deriva, dicho UNA vez y al final: contexto, no titular. */}
        <p className="text-xs text-muted-foreground">
          {format(locale, "admin.canonicalDetail.providers.promote.fromStore", {
            provider: row.provider_name,
          })}
        </p>
      </div>
    </Shell>
  );
}
