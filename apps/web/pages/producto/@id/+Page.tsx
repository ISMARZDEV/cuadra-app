import { useData } from "vike-react/useData";

import { CompareTable } from "../../../src/components/compare-table";
import type { ProductData } from "./+data";

export default function Page() {
  const comparison = useData<ProductData>();
  return (
    <main>
      <h1>{comparison.name}</h1>
      <p>
        Mejor precio en <strong>{comparison.cheapest_provider}</strong>.
      </p>
      <CompareTable comparison={comparison} />
    </main>
  );
}
