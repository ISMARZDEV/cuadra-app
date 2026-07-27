import type { ImportRowRequest } from "@cuadra/api-client";

// Parser de CSV pegado (US-CP-L8, paso 1). A propósito NO valida nada: la validación es del
// backend, que es el único que puede además detectar duplicados contra el catálogo. Acá sólo se
// traduce texto → filas.
//
// Mapeo explícito de encabezados: el SDD exige que el nombre del CSV y el de la columna del modelo
// no diverjan en silencio. Se aceptan alias del operador, pero cada uno está escrito acá.

const HEADER_ALIASES: Record<string, keyof ImportRowRequest> = {
  name: "name",
  nombre: "name",
  producto: "name",
  brand: "brand",
  marca: "brand",
  size_amount: "size_amount",
  cantidad: "size_amount",
  size_measure: "size_measure",
  unidad: "size_measure",
  display_size: "display_size",
  tamano: "display_size",
  tamaño: "display_size",
  quality: "quality",
  calidad: "quality",
  image_url: "image_url",
  imagen: "image_url",
  category: "category",
  categoria: "category",
  categoría: "category",
};

export interface ParsedCsv {
  rows: ImportRowRequest[];
  /** Encabezados que no se reconocieron: se le muestran al operador en vez de descartarlos callado. */
  unknownHeaders: string[];
}

/** Divide una línea CSV respetando comillas dobles (`"Arroz, Blanco",GOYA,5,mass`). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === ";" || char === "\t") && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((v) => v.trim());
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], unknownHeaders: [] };

  const rawHeaders = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const unknownHeaders = rawHeaders.filter((h) => h && !HEADER_ALIASES[h]);

  return {
    rows: lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      const row: ImportRowRequest = {
        name: "",
        size_amount: "",
        size_measure: "",
      } as ImportRowRequest;
      rawHeaders.forEach((header, index) => {
        const field = HEADER_ALIASES[header];
        if (field) (row as Record<string, unknown>)[field] = cells[index] ?? "";
      });
      return row;
    }),
    unknownHeaders,
  };
}
