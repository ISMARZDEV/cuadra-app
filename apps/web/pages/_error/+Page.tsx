import { usePageContext } from "vike-react/usePageContext";

// Página de error. Sin ella, un `throw render(404)` cae a 500 (soft-404, malo para SEO). Con
// ella, Vike renderiza este contenido CON el status correcto (404 / 500).
export default function Page() {
  const pageContext = usePageContext();
  const is404 = pageContext.is404 ?? false;
  return (
    <main>
      <h1>{is404 ? "Producto no encontrado" : "Algo salió mal"}</h1>
      <p>
        {is404
          ? "No encontramos ese producto. Puede que ya no esté en catálogo."
          : "Ocurrió un error. Intentá de nuevo en un momento."}
      </p>
      <p>
        <a href="/">← Volver al inicio</a>
      </p>
    </main>
  );
}
