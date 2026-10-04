import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, test } from "vitest";

import { useThinkingGate } from "./use-thinking-gate";

/**
 * EL HUECO DE UN FOTOGRAMA entre soltar el orbe y entrar en «Pensando…».
 *
 * ⚠️⚠️ Este defecto NO se ve mirando el valor final: al terminar todo está bien. Se ve mirando cada
 * COMMIT. Por eso se afirma sobre la SECUENCIA — un test del estado final pasa en verde con la
 * cúpula parpadeando en el dispositivo.
 *
 * ⚠️⚠️ **Y se registra en un `useEffect`, NO en el cuerpo del componente.** Un ajuste de estado
 * durante el render hace que React DESCARTE esa pasada y vuelva a renderizar; el cuerpo ya se
 * ejecutó, así que anotar ahí cuenta un fotograma que nunca se pintó — y el test daba por roto un
 * arreglo correcto. El usuario no ve renders: ve COMMITS, que es lo que corre efectos.
 */
function probe() {
  const commits: { pressing: boolean; thinking: boolean }[] = [];
  let setThinking: (value: boolean) => void = () => {};

  function Probe({ pressing }: { pressing: boolean }) {
    const [thinking, set] = useThinkingGate(pressing);
    setThinking = set;
    // Sin array de dependencias: uno por commit, con los valores de ESE commit.
    useEffect(() => {
      commits.push({ pressing, thinking });
    });
    return null;
  }

  return { commits, Probe, apagar: (value: boolean) => setThinking(value) };
}

describe("useThinkingGate", () => {
  test("al SOLTAR no se commitea ni un solo fotograma sin velo", () => {
    const { commits, Probe } = probe();
    const view = render(<Probe pressing />);
    commits.length = 0;

    act(() => view.rerender(<Probe pressing={false} />));

    // El hueco: el dedo ya levantado y «pensando» todavía apagado. Ahí es donde `use-liquid-focus`
    // ve `listening: true → false`, lanza la onda de salida y la cúpula se va… para volver al
    // fotograma siguiente.
    expect(commits.filter((c) => !c.pressing && !c.thinking)).toEqual([]);
    expect(commits.at(-1)).toEqual({ pressing: false, thinking: true });
  });

  test("al PULSAR se apaga —un gesto nuevo cancela el ciclo anterior—", () => {
    const { commits, Probe } = probe();
    const view = render(<Probe pressing={false} />);
    act(() => view.rerender(<Probe pressing />));

    expect(commits.at(-1)).toEqual({ pressing: true, thinking: false });
  });

  test("se puede apagar desde fuera sin que un re-render lo resucite", () => {
    // Lo apaga `decidir()` cuando la sesión de voz cierra. Un re-render con el mismo `pressing` NO
    // puede volver a encenderlo: si lo hiciera, el «Pensando…» sería inmortal.
    const { commits, Probe, apagar } = probe();
    const view = render(<Probe pressing />);
    act(() => view.rerender(<Probe pressing={false} />));
    expect(commits.at(-1)?.thinking).toBe(true);

    act(() => apagar(false));
    act(() => view.rerender(<Probe pressing={false} />));

    expect(commits.at(-1)?.thinking).toBe(false);
  });
});
