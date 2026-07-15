// Guard de PARIDAD estructural web↔mobile + invariantes de la skill cuadra-web (enforced, no
// aspiracional — el equivalente frontend del import-linter del backend). Lee el filesystem real.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// vitest corre desde el dir del paquete (apps/web) → cwd es estable y absoluto.
const WEB = process.cwd(); //                    apps/web
const REPO = join(WEB, "..", ".."); //           repo root
const MOBILE = join(REPO, "apps/mobile");

/** Recorre `dir` y devuelve las rutas de archivo que cumplen `pred`. */
function walk(dir: string, pred: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(WEB.length);

describe("arquitectura web ↔ mobile (paridad estructural · skill cuadra-web)", () => {
  it("las rutas del marketplace Save (pages/save/supermarkets/**/+Page.tsx) son re-exports FINOS del screen", () => {
    // Las páginas placeholder de verticales futuros (financial-products/insurance/investments) NO
    // son screens del feature → se excluyen; el invariante aplica a las rutas con construcción real.
    const pages = walk(join(WEB, "pages/save/supermarkets"), (p) => p.endsWith("+Page.tsx"));
    expect(pages.length).toBeGreaterThan(0);
    const notThin = pages.filter((p) => {
      const src = readFileSync(p, "utf8");
      // fino = re-exporta el default desde @/features (sin construcción inline en la ruta)
      return !/export\s*\{[^}]*\bas default\b[^}]*\}\s*from\s*["']@\/features\//.test(src);
    });
    expect(notThin.map(rel), "estas rutas tienen construcción inline; muévela a features/save/screens/").toEqual(
      [],
    );
  });

  it("los features NO importan de pages/ ni de +data (sin dependencia hacia atrás)", () => {
    const files = walk(join(WEB, "src/features"), (p) => /\.(ts|tsx)$/.test(p));
    const offenders = files.filter((p) =>
      /from\s+["'][^"']*(\/pages\/|\+data)/.test(readFileSync(p, "utf8")),
    );
    expect(offenders.map(rel), "un feature no puede depender del router; define el tipo SSR en features/save/types.ts").toEqual(
      [],
    );
  });

  it("no hay barrel index.ts en features/ (rompe fast-refresh y tree-shaking)", () => {
    const barrels = walk(join(WEB, "src/features"), (p) => /\/index\.(ts|tsx)$/.test(p));
    expect(barrels.map(rel)).toEqual([]);
  });

  it("web tiene la forma feature-first de Save (espejo de mobile)", () => {
    for (const sub of ["features/save/components", "features/save/screens", "features/save/lib"]) {
      expect(existsSync(join(WEB, "src", sub)), `falta apps/web/src/${sub}`).toBe(true);
    }
    // Paridad: mobile también organiza Save por feature con su carpeta de componentes.
    expect(existsSync(join(MOBILE, "src/features/save/components")), "falta apps/mobile/src/features/save/components").toBe(
      true,
    );
  });
});
