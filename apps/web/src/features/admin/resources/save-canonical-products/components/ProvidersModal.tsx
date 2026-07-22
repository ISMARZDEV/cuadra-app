import type { AdminCanonicalProviderPriceDto } from "@cuadra/api-client";
import { Dialog } from "@base-ui/react/dialog";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui-base/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { formatMoney } from "@/features/save/lib/format";

import { listCanonicalProductProviders } from "../api";

interface ProvidersModalProps {
  canonicalProductId: string;
  canonicalProductName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProvidersModal({
  canonicalProductId,
  canonicalProductName,
  open,
  onOpenChange,
}: ProvidersModalProps) {
  const [providers, setProviders] = useState<AdminCanonicalProviderPriceDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    async function loadProviders() {
      setLoading(true);
      const result = await listCanonicalProductProviders(canonicalProductId);
      if (result) setProviders(result);
      setLoading(false);
    }

    loadProviders();
  }, [open, canonicalProductId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                Proveedores matcheados
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {canonicalProductName}
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="size-8"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Cargando proveedores...</div>
              </div>
            ) : providers.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">
                  No hay proveedores matcheados para este producto
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <TableRow key={provider.provider_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{provider.provider_name}</span>
                          {provider.is_cheapest && (
                            <Badge variant="default" className="text-xs">
                              Mejor precio
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
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
                            Ver en tienda
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
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
