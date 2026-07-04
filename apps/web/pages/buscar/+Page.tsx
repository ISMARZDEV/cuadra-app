import { useData } from "vike-react/useData";

import type { SearchData } from "./+data";

export default function Page() {
  const { q, results } = useData<SearchData>();
  return (
    <main>
      <h1>Buscar productos</h1>
      <form method="get" action="/buscar">
        <input type="search" name="q" defaultValue={q} placeholder="arroz, aceite, leche…" />
        <button type="submit">Buscar</button>
      </form>
      {q && (
        <p>
          {results.length} resultado(s) para <strong>{q}</strong>
        </p>
      )}
      <ul>
        {results.map((product) => (
          <li key={product.id}>
            <a href={`/producto/${product.id}`}>
              {product.name} {product.brand && <span>· {product.brand}</span>}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
