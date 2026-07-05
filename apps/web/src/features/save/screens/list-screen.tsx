import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import { useShoppingList } from "../hooks/use-shopping-list";
import { formatMoney } from "../lib/format";

// Lista de compra local (D1): items con stepper de cantidad, quitar y subtotal estimado. Estado
// 100% cliente (localStorage) → en SSR renderiza vacío y se rellena al hidratar. Sin auth.
export function ListScreen() {
  const { locale, country, t } = usePageI18n();
  const { items, total, count, setQty, remove } = useShoppingList();
  const currency = items[0]?.currency ?? "DOP";
  const productHref = (id: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${id}`);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t("list.title")}</h1>

      {items.length === 0 ? (
        <div className="mt-6">
          <p className="text-muted-foreground">{t("list.empty")}</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <a href={localeHref(locale, country, "/save/supermarkets")}>
              {t("list.keepShopping")}
            </a>
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {count} {t("list.items")}
          </p>

          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Card className="flex items-center gap-3 p-3">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="size-16 shrink-0 rounded-md object-contain"
                    />
                  ) : (
                    <div className="size-16 shrink-0 rounded-md bg-muted" aria-hidden />
                  )}

                  <div className="min-w-0 flex-1">
                    <a href={productHref(item.id)} className="text-sm font-medium hover:underline">
                      {item.name}
                    </a>
                    {item.brand && (
                      <p className="text-xs text-muted-foreground">{item.brand}</p>
                    )}
                    <p className="text-sm font-bold">
                      {formatMoney(item.price_minor, item.currency)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="-"
                      onClick={() => setQty(item.id, item.qty - 1)}
                      className="flex size-7 items-center justify-center rounded-md border border-border hover:border-primary"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm">{item.qty}</span>
                    <button
                      type="button"
                      aria-label="+"
                      onClick={() => setQty(item.id, item.qty + 1)}
                      className="flex size-7 items-center justify-center rounded-md border border-border hover:border-primary"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label={t("list.remove")}
                    onClick={() => remove(item.id)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </Card>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">{t("list.total")}</span>
            <span className="text-xl font-bold">{formatMoney(total, currency)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("list.disclaimer")}</p>
        </>
      )}
    </div>
  );
}
