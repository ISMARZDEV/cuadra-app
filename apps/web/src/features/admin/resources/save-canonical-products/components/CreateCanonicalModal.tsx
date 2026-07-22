import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui-base/button";
import { Input } from "@/components/ui-base/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createCanonicalProduct } from "../api";

interface CreateCanonicalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateCanonicalModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateCanonicalModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    brand: "",
    size_amount: "",
    size_measure: "mass",
    quality: "",
    display_size: "",
    image_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        brand: formData.brand || undefined,
        size_amount: parseFloat(formData.size_amount),
        size_measure: formData.size_measure,
        quality: formData.quality || undefined,
        display_size: formData.display_size || undefined,
        image_url: formData.image_url || undefined,
      };

      const result = await createCanonicalProduct(payload);

      if (result) {
        onSuccess();
        onOpenChange(false);
        // Reset form
        setFormData({
          name: "",
          brand: "",
          size_amount: "",
          size_measure: "mass",
          quality: "",
          display_size: "",
          image_url: "",
        });
      } else {
        setError("No se pudo crear el producto canónico");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el producto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                Añadir producto canónico
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Crea un nuevo producto canónico manualmente
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

          <form onSubmit={handleSubmit} className="px-6 py-4">
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">
                    Nombre <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Arroz Goya"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Marca</label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Ej: GOYA"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Cantidad <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.size_amount}
                    onChange={(e) => setFormData({ ...formData, size_amount: e.target.value })}
                    placeholder="Ej: 10"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Unidad <span className="text-destructive">*</span>
                  </label>
                  <Select
                    value={formData.size_measure}
                    onValueChange={(value) =>
                      setFormData({ ...formData, size_measure: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mass">Masa (kg, g, lb)</SelectItem>
                      <SelectItem value="volume">Volumen (L, ml)</SelectItem>
                      <SelectItem value="count">Unidad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Tamaño</label>
                  <Input
                    value={formData.display_size}
                    onChange={(e) => setFormData({ ...formData, display_size: e.target.value })}
                    placeholder="Ej: 10 LB"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Calidad</label>
                  <Input
                    value={formData.quality}
                    onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
                    placeholder="Ej: premium, standard"
                  />
                </div>

                <div className="col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">URL de imagen</label>
                  <Input
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creando..." : "Crear producto"}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
