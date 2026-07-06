import type { BasketQueryDto } from "@cuadra/api-client";
import type { FormEvent } from "react";
import { useState } from "react";
import { useData } from "vike-react/useData";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createBasketQueryEntry, removeBasketQueryEntry, updateBasketQueryEntry } from "../api";
import type { BasketQueriesData } from "../interfaces";
import { DEFAULT_BASKET_MARKET, UNCATEGORIZED_LABEL } from "../types";

// Editor de la canasta curada (3.16): lista + búsqueda cliente de las 213 queries (batch 3D) +
// alta/edición/activación/baja. Sin TanStack Query — tras cualquier mutación exitosa,
// `window.location.reload()` (mismo patrón que ProvidersScreen/SourcesScreen) re-pide la lista SSR.
export function BasketEditorScreen() {
  const { entries } = useData<BasketQueriesData>();
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? entries.filter((e) =>
        `${e.query_text} ${e.category_label ?? ""}`.toLowerCase().includes(needle),
      )
    : entries;

  const groups = groupByCategory(filtered);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-bold">Canasta curada (Save)</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Queries usadas para armar la canasta de comparación (mercado {DEFAULT_BASKET_MARKET}).
      </p>

      <AddQueryForm />

      <label className="mt-8 flex flex-col gap-1 text-sm sm:max-w-sm">
        Buscar en la canasta
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por texto o categoría…"
        />
      </label>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sin queries todavía.</p>
      ) : groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sin resultados para esa búsqueda.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-6">
          {groups.map(([category, rows]) => (
            <section key={category}>
              <h2 className="mb-3 text-lg font-semibold">{category}</h2>
              <ul className="flex flex-col gap-3">
                {rows.map((row) => (
                  <BasketQueryRow key={row.id} entry={row} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByCategory(entries: BasketQueryDto[]): Array<[string, BasketQueryDto[]]> {
  const map = new Map<string, BasketQueryDto[]>();
  for (const e of entries) {
    const key = e.category_label ?? UNCATEGORIZED_LABEL;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()];
}

function AddQueryForm() {
  const [categoryLabel, setCategoryLabel] = useState("");
  const [queryText, setQueryText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createBasketQueryEntry({
      marketId: DEFAULT_BASKET_MARKET,
      queryText,
      categoryLabel: categoryLabel.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    window.location.reload();
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:max-w-md"
    >
      <h2 className="text-sm font-semibold">Agregar query</h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        Categoría (alta)
        <Input value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Query (alta)
        <Input value={queryText} onChange={(e) => setQueryText(e.target.value)} required />
      </label>

      <Button type="submit" disabled={busy}>
        Agregar query
      </Button>
    </form>
  );
}

function BasketQueryRow({ entry }: { entry: BasketQueryDto }) {
  const [queryText, setQueryText] = useState(entry.query_text);
  const [categoryLabel, setCategoryLabel] = useState(entry.category_label ?? "");
  const [busySave, setBusySave] = useState(false);
  const [busyToggle, setBusyToggle] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setBusySave(true);
    setError(null);
    const res = await updateBasketQueryEntry(entry.id, {
      queryText,
      categoryLabel: categoryLabel.trim() || null,
    });
    setBusySave(false);
    if (res.error) {
      setError("No se pudo guardar los cambios.");
      return;
    }
    window.location.reload();
  };

  const onToggleActive = async () => {
    setBusyToggle(true);
    setError(null);
    const res = await updateBasketQueryEntry(entry.id, { active: !entry.active });
    setBusyToggle(false);
    if (res.error) {
      setError("No se pudo cambiar el estado.");
      return;
    }
    window.location.reload();
  };

  const onDelete = async () => {
    setBusyDelete(true);
    setError(null);
    const res = await removeBasketQueryEntry(entry.id);
    setBusyDelete(false);
    if (res?.error) {
      setError("No se pudo eliminar la query.");
      return;
    }
    window.location.reload();
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {`Categoría de ${entry.id}`}
        <Input
          value={categoryLabel}
          onChange={(e) => setCategoryLabel(e.target.value)}
          className="h-8 w-40"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {`Query de ${entry.id}`}
        <Input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          className="h-8 w-56"
        />
      </label>

      <Button size="sm" variant="outline" disabled={busySave} onClick={() => void onSave()}>
        {`Guardar ${entry.id}`}
      </Button>

      <Button size="sm" variant="outline" disabled={busyToggle} onClick={() => void onToggleActive()}>
        {entry.active ? `Desactivar ${entry.id}` : `Activar ${entry.id}`}
      </Button>

      {confirmingDelete ? (
        <>
          <span className="text-xs text-destructive">¿Eliminar esta query?</span>
          <Button size="sm" variant="destructive" disabled={busyDelete} onClick={() => void onDelete()}>
            {`Confirmar eliminar ${entry.id}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancelar
          </Button>
        </>
      ) : (
        <Button size="sm" variant="destructive" onClick={() => setConfirmingDelete(true)}>
          {`Eliminar ${entry.id}`}
        </Button>
      )}
    </li>
  );
}
