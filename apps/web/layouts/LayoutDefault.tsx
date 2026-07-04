import type { ReactNode } from "react";

import "./style.css";

// Shell común a todas las páginas. Marca Cuadra Save (verde), warm/rounded (design system).
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <a href="/" className="brand">
          Cuadra <span>Save</span>
        </a>
        <nav>
          <a href="/buscar">Buscar</a>
        </nav>
      </header>
      <div className="content">{children}</div>
      <footer className="foot">Precios de catálogo online · República Dominicana</footer>
    </div>
  );
}
