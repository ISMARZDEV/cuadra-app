import type {
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
} from "@cuadra/api-client";
import { Dialog } from "@base-ui/react/dialog";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui-base/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { formatMoney } from "@/features/save/lib/format";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import { listCanonicalProductProviders } from "../api";
import { formatCatalogDate } from "../lib/format-date";

interface ProvidersModalProps {
  /** `null` = cerrado. Se pasa el producto entero (no sólo el id) para titular sin otra consulta. */
  product: AdminCanonicalProductRowDto | null;
  onClose: () => void;
  t: (key: MessageKey) => string;
  locale: Locale;
}

// Modal "Ver proveedores" (US-CP-L4): tiendas ordenadas por precio ascendente, la más barata
// destacada. Los precios llegan en MINOR UNITS y sólo se formatean acá — nunca se hace aritmética
// de dinero en el cliente.
export function ProvidersModal({ product, onClose, t, locale }: ProvidersModalProps) {
  const [providers, setProviders] = useState<AdminCanonicalProviderPriceDto[]>([]);
  const [loading, setLoading] = useState(false);

  const productId = product?.canonical_product_id ?? null;

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    setProviders([]);
    void (async () => {
      const result = await listCanonicalProductProviders(productId);
      // Si el operador cerró y abrió OTRO producto mientras esta respuesta viajaba, pintarla
      // mostraría los precios del producto anterior bajo el título del nuevo.
      if (cancelled) return;
      if (result) setProviders(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!product) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                {t("admin.canonicalProducts.providers.title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {product.name}
              </Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("admin.canonicalProducts.providers.loading")}
              </p>
            ) : providers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("admin.canonicalProducts.providers.empty")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-black/5 dark:border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>
                        {t("admin.canonicalProducts.providers.col.provider")}
                      </TableHead>
                      <TableHead>
                        {t("admin.canonicalProducts.providers.col.lastSeen")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("admin.canonicalProducts.providers.col.price")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("admin.canonicalProducts.providers.col.action")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.map((provider) => (
                      <TableRow key={provider.store_product_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ProviderLogo
                              name={provider.provider_name}
                              logoUrl={provider.provider_logo_url}
                              className="max-h-7 max-w-12 object-contain"
                            />
                            {provider.is_cheapest ? (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                {t("admin.canonicalProducts.providers.cheapest")}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatCatalogDate(provider.last_seen_at, locale)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(provider.price_minor, provider.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {provider.url ? (
                            <a
                              href={provider.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              {t("admin.canonicalProducts.providers.open")}
                              <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
