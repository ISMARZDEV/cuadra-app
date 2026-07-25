import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui-base/button";
import { Input } from "@/components/ui-base/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MessageKey } from "@/i18n/messages";

import { createCanonicalProduct, updateCanonicalProduct } from "../api";

export type CanonicalFormState =
  | { mode: "create" }
  | { mode: "edit"; row: AdminCanonicalProductRowDto };

interface CanonicalFormModalProps {
  state: CanonicalFormState | null;
  onClose: () => void;
  onSaved: () => void;
  t: (key: MessageKey) => string;
}

const EMPTY = {
  name: "",
  brand: "",
  size_amount: "",
  size_measure: "mass",
  display_size: "",
  quality: "",
  image_url: "",
};

// Alta manual (US-CP-L7) y edición básica (US-CP-L5) comparten formulario a propósito: son los
// MISMOS campos del canónico. Dos formularios distintos para la misma entidad terminan siempre
// divergiendo en validaciones.
export function CanonicalFormModal({ state, onClose, onSaved, t }: CanonicalFormModalProps) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = state?.mode === "edit";

  useEffect(() => {
    if (!state) return;
    setError(null);
    if (state.mode === "edit") {
      setForm({
        name: state.row.name,
        brand: state.row.brand ?? "",
        size_amount: String(state.row.size_amount ?? ""),
        size_measure: state.row.size_measure ?? "mass",
        display_size: state.row.display_size ?? "",
        quality: state.row.quality ?? "",
        image_url: state.row.image_url ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [state]);

  if (!state) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // `size_amount` y `size_measure` viajan JUNTOS o no viajan: el backend rechaza un tamaño
      // a medias porque dejaría el producto con una cantidad incoherente con su unidad.
      const amount = Number(form.size_amount);
      const result = isEdit
        ? await updateCanonicalProduct(state.row.canonical_product_id, {
            name: form.name,
            brand: form.brand || null,
            size_amount: Number.isFinite(amount) ? String(amount) : null,
            size_measure: Number.isFinite(amount) ? form.size_measure : null,
            quality: form.quality || null,
            display_size: form.display_size || null,
            image_url: form.image_url || null,
          } as never)
        : await createCanonicalProduct({
            name: form.name,
            brand: form.brand || null,
            size_amount: String(amount),
            size_measure: form.size_measure,
            quality: form.quality || null,
            display_size: form.display_size || null,
            image_url: form.image_url || null,
          } as never);

      if (!result) {
        setError(
          t(isEdit ? "admin.canonicalProducts.edit.error" : "admin.canonicalProducts.create.error"),
        );
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                {t(
                  isEdit
                    ? "admin.canonicalProducts.edit.title"
                    : "admin.canonicalProducts.create.title",
                )}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {t(
                  isEdit
                    ? "admin.canonicalProducts.edit.subtitle"
                    : "admin.canonicalProducts.create.subtitle",
                )}
              </Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
              <X className="size-4" />
            </Button>
          </div>

          <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {error ? (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <Field label={t("admin.canonicalProducts.form.name")} required className="col-span-2">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </Field>

                <Field label={t("admin.canonicalProducts.form.brand")}>
                  <Input
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="GOYA"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("admin.canonicalProducts.form.brandHint")}
                  </p>
                </Field>

                <Field label={t("admin.canonicalProducts.form.amount")} required>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.size_amount}
                    onChange={(e) => setForm({ ...form, size_amount: e.target.value })}
                    required
                  />
                </Field>

                <Field label={t("admin.canonicalProducts.form.measure")} required>
                  <Select
                    value={form.size_measure}
                    onValueChange={(v) => setForm({ ...form, size_measure: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mass">
                        {t("admin.canonicalProducts.measure.mass")}
                      </SelectItem>
                      <SelectItem value="volume">
                        {t("admin.canonicalProducts.measure.volume")}
                      </SelectItem>
                      <SelectItem value="count">
                        {t("admin.canonicalProducts.measure.count")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={t("admin.canonicalProducts.form.displaySize")}>
                  <Input
                    value={form.display_size}
                    onChange={(e) => setForm({ ...form, display_size: e.target.value })}
                    placeholder="10 Lb"
                  />
                </Field>

                <Field label={t("admin.canonicalProducts.form.quality")} className="col-span-2">
                  <Input
                    value={form.quality}
                    onChange={(e) => setForm({ ...form, quality: e.target.value })}
                    placeholder="premium"
                  />
                </Field>

                <Field label={t("admin.canonicalProducts.form.imageUrl")} className="col-span-2">
                  <Input
                    type="url"
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  {t("admin.canonicalProducts.form.cancel")}
                </Button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90 disabled:opacity-50"
                >
                  {saving
                    ? t(
                        isEdit
                          ? "admin.canonicalProducts.edit.submitting"
                          : "admin.canonicalProducts.create.submitting",
                      )
                    : t(
                        isEdit
                          ? "admin.canonicalProducts.edit.submit"
                          : "admin.canonicalProducts.create.submit",
                      )}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </label>
      {children}
    </div>
  );
}
