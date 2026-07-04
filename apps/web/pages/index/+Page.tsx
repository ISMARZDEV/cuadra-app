// Landing pública (SSR → indexable). El buscador es un form GET a /buscar (sin JS de cliente).
export default function Page() {
  return (
    <main>
      <h1>Compara precios de supermercado en RD</h1>
      <p>
        Encuentra en qué supermercado te sale más barata tu compra. Precios de catálogo de
        Sirena, Nacional, Jumbo y más.
      </p>
      <form method="get" action="/buscar">
        <input type="search" name="q" placeholder="Busca un producto… (arroz, aceite, leche)" />
        <button type="submit">Buscar</button>
      </form>
    </main>
  );
}
