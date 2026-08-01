import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// PRIMERA configuración de ESLint del repo. Hasta ahora no existía ningún fichero de config en
// ninguna app, pese a que había comentarios `eslint-disable` en el código y `apps/mobile` declaraba
// un script `"lint": "eslint ."` que no podía funcionar. O sea: el lint llevaba tiempo sin correr,
// ni en local ni en CI.
//
// Criterio de entrada: que PASE hoy sin reescribir medio repo. Se ponen en `error` sólo las reglas
// que atrapan bugs de verdad (las de hooks, que es de donde salen los re-renders infinitos y los
// efectos con dependencias mal declaradas); el resto entra como `warn` para que sea visible sin
// bloquear. Subir el listón se hace regla a regla, cuando su deuda esté pagada.
export default tseslint.config(
  {
    // Generado o ajeno: no es nuestro código y linterlo sólo produce ruido.
    ignores: ["dist/**", "build/**", "node_modules/**", ".vike/**", "server/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // `any` es deuda, pero hay bastante heredado: visible, no bloqueante.
      "@typescript-eslint/no-explicit-any": "warn",
      // El `_` inicial es la convención del repo para "existe pero no se usa a propósito".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Los tests montan y desmontan de todo; las reglas de hooks no aplican igual ahí.
    files: ["**/*.test.{ts,tsx}"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
);
