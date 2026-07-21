import type { RunEventDto } from "@cuadra/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunActivityPanel } from "./RunActivityPanel";

function evt(over: Partial<RunEventDto> = {}): RunEventDto {
  return {
    timestamp: "2026-07-20T23:01:58Z",
    level: "info",
    kind: "started",
    message: "",
    step_key: null,
    is_noise: false,
    has_text: true,
    failure: null,
    ...over,
  };
}

const t = (k: string) => k;

function panel(props: Partial<React.ComponentProps<typeof RunActivityPanel>> = {}) {
  return render(
    <RunActivityPanel
      events={[]}
      nextCursor={null}
      onLoadMore={vi.fn()}
      locale="es"
      t={t as never}
      {...props}
    />,
  );
}

describe("RunActivityPanel", () => {
  it("distingue 'no pude preguntar' de 'no pasó nada'", () => {
    // Es la mentira más cara que este módulo puede contar, y ya la contó una vez con
    // "nunca corrió" vs "runner muerto". `null` = runner caído; `[]` = corrida sin eventos.
    const { unmount } = panel({ events: null });
    expect(screen.getByText("admin.orchestration.detail.activityUnavailable")).toBeTruthy();
    unmount();

    panel({ events: [] });
    expect(screen.getByText("admin.orchestration.detail.activityEmpty")).toBeTruthy();
  });

  it("nombra los hitos de la corrida que el runner manda SIN texto", () => {
    // Verificado contra un Dagster real: `RunStartEvent` & co. llegan con `message: ""`. Si la UI
    // no pone la palabra desde el `kind`, la línea de tiempo pinta filas mudas.
    panel({ events: [evt({ kind: "started", message: "", has_text: false })] });

    expect(screen.getByText("admin.orchestration.event.started")).toBeTruthy();
  });

  it("esconde la maquinaria por defecto y la revela con un clic, sin ir al servidor", () => {
    // La página ya trae TODO (18-30 eventos medidos): el toggle es instantáneo. Filtrar del lado
    // del servidor habría costado un segundo viaje para ver lo que ya estaba en memoria.
    const onLoadMore = vi.fn();
    panel({
      events: [
        evt({ kind: "log", message: "0 bajadas detectadas (7d)" }),
        evt({ kind: "machinery", message: "Started process for run (pid: 80035).", is_noise: true }),
      ],
      onLoadMore,
    });

    expect(screen.queryByText(/pid: 80035/)).toBeNull();

    fireEvent.click(screen.getByText("admin.orchestration.detail.activityShowAll"));

    expect(screen.getByText(/pid: 80035/)).toBeTruthy();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("muestra la causa RAÍZ del fallo, no el envoltorio de Dagster", () => {
    panel({
      events: [
        evt({
          kind: "failure",
          level: "error",
          message: 'Execution of step "query_catalog_prices" failed.',
          failure: {
            summary:
              "psycopg.OperationalError: consuming input failed: server closed the connection",
            detail: 'dagster: Error occurred while executing op "query_catalog_prices":',
            root_class_name: "OperationalError",
          },
        }),
      ],
    });

    expect(screen.getByText(/server closed the connection/)).toBeTruthy();
    // El envoltorio no se tira, pero tampoco compite: vive PLEGADO en el detalle técnico.
    // (Se comprueba que el `<details>` esté cerrado, no que el texto falte: `<details>` renderiza
    // su contenido igual — el navegador lo esconde con CSS, no con el DOM.)
    const wrapper = screen.getByText(/Error occurred while executing op/);
    expect(wrapper.closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("admin.orchestration.detail.failureTechnical")).toBeTruthy();
  });

  it("ofrece cargar más SOLO cuando el runner dijo que hay más", () => {
    const onLoadMore = vi.fn();
    const { unmount } = panel({ events: [evt()], nextCursor: null, onLoadMore });
    expect(screen.queryByText("admin.orchestration.detail.activityLoadMore")).toBeNull();
    unmount();

    panel({ events: [evt()], nextCursor: "c-1", onLoadMore });
    fireEvent.click(screen.getByText("admin.orchestration.detail.activityLoadMore"));

    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("muestra los segundos, porque una corrida entera cabe en un minuto", () => {
    // Medido: cuatro eventos consecutivos a las 23:01:58. Sin segundos, la línea de tiempo dice
    // que todo pasó a la vez y deja de contestar en qué ORDEN ocurrió.
    panel({ events: [evt({ timestamp: "2026-07-20T23:01:58Z", kind: "log", message: "x" })] });

    expect(screen.getByText(/11:01:58/)).toBeTruthy();
  });
});

describe("RunActivityPanel · causa duplicada", () => {
  it("no repite la MISMA causa dos veces seguidas", () => {
    // Verificado con un fallo real: cuando un paso revienta llegan DOS eventos con la excepción
    // idéntica (`ExecutionStepFailureEvent` y después `RunFailureEvent`). Pintar los dos bloques
    // rojos apilados es ruido: el operador lee el mismo texto dos veces y ninguno agrega nada.
    const same = {
      summary: "DagsterInvariantViolationError: Cannot access partition_key",
      detail: "DagsterInvariantViolationError: Cannot access partition_key",
      root_class_name: "DagsterInvariantViolationError",
    };
    panel({
      events: [
        evt({ kind: "failure", level: "error", message: "step falló", step_key: "q", failure: same }),
        evt({ kind: "failure", level: "error", message: "run falló", failure: { ...same } }),
      ],
    });

    // Las dos LÍNEAS siguen (son hechos distintos: falló el paso y falló la corrida)...
    expect(screen.getByText("step falló")).toBeTruthy();
    expect(screen.getByText("run falló")).toBeTruthy();
    // ...pero el bloque de causa se pinta UNA sola vez.
    expect(screen.getAllByTestId("failure-cause")).toHaveLength(1);
  });

  it("sí muestra dos causas cuando son DISTINTAS", () => {
    panel({
      events: [
        evt({ kind: "failure", level: "error", message: "a", failure: { summary: "timeout de red", detail: "timeout de red", root_class_name: "Timeout" } }),
        evt({ kind: "failure", level: "error", message: "b", failure: { summary: "la DB cerró la conexión", detail: "la DB cerró la conexión", root_class_name: "OperationalError" } }),
      ],
    });

    expect(screen.getAllByTestId("failure-cause")).toHaveLength(2);
  });
});

describe("RunActivityPanel · carga", () => {
  it("no confunde 'estoy cargando' con 'no pude preguntar'", () => {
    // `events === null` significa runner caído. Mientras se pide la actividad de OTRA corrida el
    // estado también es null — sin distinguirlos, seleccionar una corrida del histórico haría
    // parpadear "el orquestador no respondió" en cada clic.
    panel({ events: null, loading: true });

    expect(screen.queryByText("admin.orchestration.detail.activityUnavailable")).toBeNull();
    expect(screen.getByTestId("activity-loading")).toBeTruthy();
  });
});
