import { Card } from "@/components/ui/card";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";
import { slugify } from "@/lib/utils";

// Todas las categorías (Imagen #6): sidebar de categorías + grid de subcategorías. Estructura;
// la taxonomía real (endpoint backend) se cablea después.
const CATEGORIES = [
  "Alcohol", "Bebés", "Bebidas", "Carnes & Pescados", "Cuidado Del Hogar", "Cuidado Personal",
  "Despensa & Abarrotes", "Embutidos & Delicatessen", "Escolares & Oficina", "Frutas & Verduras",
  "Lácteos & Huevos", "Mascotas", "Panadería & Tortillería", "Salud & Farmacia", "Snacks & Dulces",
];

export default function Page() {
  const { locale, country, t } = usePageI18n();
  const catHref = (name: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${slugify(name)}`);

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[220px_1fr]">
      <aside>
        <ul className="space-y-1 text-sm">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <a href={catHref(c)} className="block rounded-md px-3 py-2 hover:bg-secondary">
                {c}
              </a>
            </li>
          ))}
        </ul>
      </aside>
      <div>
        <h1 className="mb-4 text-2xl font-bold">{t("categories.title")}</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <a key={c} href={catHref(c)}>
              <Card className="flex h-32 items-end bg-muted/30 p-3 text-sm font-medium hover:border-primary">
                {c}
              </Card>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
