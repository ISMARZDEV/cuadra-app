import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import { Boxes, Search, X } from "lucide-react";
import { useState } from "react";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { DEFAULT_LOCALE } from "@/i18n/config";

import type { CanonicalProductsData } from "../interfaces";
import {
  type CanonicalProductsParams,
  serializeCanonicalProductsParams,
} from "../lib/canonical-products-params";
import { listCanonicalProducts } from "../api";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const QUALITY_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "complete", label: "Completo" },
  { value: "no_image", label: "Sin imagen" },
  { value: "no_category", label: "Sin categoría" },
  { value: "no_providers", label: "Sin proveedores" },
  { value: "no_quality", label: "Sin calidad" },
];

const EAN_REACHABLE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "true", label: "Con EAN" },
  { value: "false", label: "Sin EAN" },
];

export function CanonicalProductsScreen() {
  const { list: initialList, params: initialParams, locale = DEFAULT_LOCALE } =
    useData<CanonicalProductsData>();
  const [list, setList] = useState(initialList);
  const [params, setParams] = useState(initialParams);
  const [loading, setLoading] = useState(false);

  async function updateParams(patch: Partial<CanonicalProductsParams>) {
    const newParams = { ...params, ...patch, offset: patch.offset ?? 0 };
    setParams(newParams);
    setLoading(true);

    // Actualizar URL
    const qs = serializeCanonicalProductsParams(newParams);
    const url = qs.toString()
      ? `/admin/canonical-products?${qs.toString()}`
      : "/admin/canonical-products";
    navigate(url);

    // Fetch nuevos datos
    const result = await listCanonicalProducts({
      search: newParams.search,
      brand_id: newParams.brand_id,
      taxonomy_node_id: newParams.taxonomy_node_id,
      quality_status: newParams.quality_status,
      ean_reachable: newParams.ean_reachable,
      limit: newParams.limit,
      offset: newParams.offset,
    });
    if (result) setList(result);
    setLoading(false);
  }

  const totalPages = Math.ceil(list.total / params.limit);
  const currentPage = Math.floor(params.offset / params.limit) + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos Canónicos</h1>
          <p className="text-muted-foreground">
            Catálogo de productos canónicos de Save con métricas de calidad y completitud.
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Boxes className="mr-1 h-4 w-4" />
          {list.total} productos
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Búsqueda y filtros</CardTitle>
          <CardDescription>
            Busca por nombre, filtra por marca, categoría, calidad o EAN.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={params.search ?? ""}
                  onChange={(e) => updateParams({ search: e.target.value || undefined })}
                  className="pl-9"
                />
              </div>
              {params.search && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => updateParams({ search: undefined })}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Calidad</label>
                <Select
                  value={params.quality_status ?? "all"}
                  onValueChange={(v) =>
                    updateParams({ quality_status: v === "all" ? undefined : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITY_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">EAN</label>
                <Select
                  value={
                    params.ean_reachable === undefined
                      ? "all"
                      : params.ean_reachable
                        ? "true"
                        : "false"
                  }
                  onValueChange={(v) =>
                    updateParams({
                      ean_reachable: v === "all" ? undefined : v === "true",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EAN_REACHABLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Por página</label>
                <Select
                  value={String(params.limit)}
                  onValueChange={(v) => updateParams({ limit: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado de productos</CardTitle>
          <CardDescription>
            {list.rows.length} de {list.total} productos
            {loading && " (cargando...)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imagen</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Proveedores</TableHead>
                <TableHead className="text-right">Completitud</TableHead>
                <TableHead>Calidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No se encontraron productos
                  </TableCell>
                </TableRow>
              ) : (
                list.rows.map((row) => (
                  <CanonicalProductRow key={row.canonical_product_id} row={row} />
                ))
              )}
            </TableBody>
          </Table>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1 || loading}
                  onClick={() =>
                    updateParams({ offset: params.offset - params.limit })
                  }
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages || loading}
                  onClick={() =>
                    updateParams({ offset: params.offset + params.limit })
                  }
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CanonicalProductRow({ row }: { row: AdminCanonicalProductRowDto }) {
  return (
    <TableRow>
      <TableCell>
        {row.image_url ? (
          <img
            src={row.image_url}
            alt={row.name}
            className="h-12 w-12 rounded object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
            <Boxes className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </TableCell>
      <TableCell>
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.slug}</div>
        </div>
      </TableCell>
      <TableCell>{row.brand || "—"}</TableCell>
      <TableCell>{row.display_size || "—"}</TableCell>
      <TableCell>{row.category || "—"}</TableCell>
      <TableCell className="text-right">
        <Badge variant={(row.matched_provider_count ?? 0) > 0 ? "default" : "secondary"}>
          {row.matched_provider_count ?? 0}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="h-2 w-16 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${row.completeness_score}%` }}
            />
          </div>
          <span className="text-sm tabular-nums">{row.completeness_score}%</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {(row.quality_statuses ?? []).map((status) => (
            <Badge
              key={status}
              variant={status === "complete" ? "default" : "outline"}
              className="text-xs"
            >
              {status}
            </Badge>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
