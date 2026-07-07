import { diffField } from "../lib/field-diff";

interface CompareRecord {
  name: string | null;
  brand: string | null;
  sizeText: string | null;
}

interface CompareDiffProps {
  storeProduct: CompareRecord;
  candidate: CompareRecord;
}

// Vista comparativa lado a lado (feature #1, P0): CADA campo trae su `diffField` resaltado —
// nunca lado-a-lado sin resaltar (anti-patrón: más lento, más errores per la investigación CROW).
export function CompareDiff({ storeProduct, candidate }: CompareDiffProps) {
  const fields: Array<{ key: string; label: string; testId: string }> = [
    { key: "name", label: "Nombre", testId: "diff-name" },
    { key: "brand", label: "Marca", testId: "diff-brand" },
    { key: "sizeText", label: "Tamaño", testId: "diff-size" },
  ];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 pr-4">Campo</th>
          <th className="py-1 pr-4">Store product</th>
          <th className="py-1 pr-4">Candidato</th>
        </tr>
      </thead>
      <tbody>
        {fields.map(({ key, label, testId }) => {
          const a = storeProduct[key as keyof CompareRecord];
          const b = candidate[key as keyof CompareRecord];
          const diff = diffField(a, b);
          return (
            <tr
              key={key}
              data-testid={testId}
              data-diff={diff}
              className={diff === "match" ? "bg-emerald-50" : "bg-rose-50"}
            >
              <td className="py-1 pr-4 font-medium">{label}</td>
              <td className="py-1 pr-4">{a ?? "—"}</td>
              <td className="py-1 pr-4">{b ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
