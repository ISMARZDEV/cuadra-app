import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import { Boxes, Search } from "lucide-react";
import { useState } from "react";
import { useData } from "vike-react/useData";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { listCanonicalProducts } from "../api";

export function CanonicalProductsScreen() {
  const { list: initialList, locale = DEFAULT_LOCALE } = useData<CanonicalProductsData>();
  const [list, setList] = useState(initialList);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await listCanonicalProducts({ search: search || undefined, limit: 50, offset: 0 });
    if (result) setList(result);
    setLoading(false);
  }

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
            Busca por nombre, filtra por marca o categoría.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado de productos</CardTitle>
          <CardDescription>
            {list.rows.length} de {list.total} productos
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
                list.rows.map((row) => <CanonicalProductRow key={row.canonical_product_id} row={row} />)
              )}
            </TableBody>
          </Table>
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
