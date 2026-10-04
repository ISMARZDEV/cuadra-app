import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useVoiceCapture } from "./use-voice-capture";

/**
 * EL RECONOCEDOR, FINGIDO — pero con su ciclo de vida REAL.
 *
 * El módulo nativo no existe en jsdom, así que se sustituye por un registro de manejadores que el
 * test dispara a mano. Lo que importa es que respeta el contrato que el hook da por bueno:
 * `start` → `result`(s) → `end`, y ni un evento más después de cerrar.
 */
const nativo = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
}));

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    start: nativo.start,
    stop: nativo.stop,
    abort: nativo.abort,
    requestPermissionsAsync: async () => ({ granted: true }),
    getSupportedLocales: async () => ({ locales: ["es-DO", "en-US"] }),
  },
  useSpeechRecognitionEvent: (name: string, handler: (event: unknown) => void) => {
    nativo.handlers.set(name, handler);
  },
  AVAudioSessionCategory: { playAndRecord: "playAndRecord" },
  AVAudioSessionCategoryOptions: {
    mixWithOthers: "mixWithOthers",
    defaultToSpeaker: "defaultToSpeaker",
    allowBluetooth: "allowBluetooth",
  },
  AVAudioSessionMode: { measurement: "measurement" },
}));

const emitir = (name: string, event: unknown = {}) => nativo.handlers.get(name)?.(event);

function sonda() {
  const commits: string[] = [];
  const api = { clear: () => {} };

  function Sonda({ active }: { active: boolean }) {
    const { transcript, clear } = useVoiceCapture(active);
    api.clear = clear;
    // Sin array de dependencias: uno por commit. El usuario ve commits, no renders.
    useEffect(() => {
      commits.push(transcript);
    });
    return null;
  }

  const view = render(<Sonda active={false} />);

  /** Un dictado completo: se pulsa, se dice una frase, se suelta y la sesión cierra. */
  const dictar = async (frase: string) => {
    await act(async () => view.rerender(<Sonda active />));
    act(() => emitir("start"));
    act(() => emitir("result", { results: [{ transcript: frase }], isFinal: true }));
    await act(async () => view.rerender(<Sonda active={false} />));
    act(() => emitir("end"));
  };

  return { commits, dictar, limpiar: () => act(() => api.clear()) };
}

describe("useVoiceCapture — lo dictado no puede sobrevivir a su ciclo", () => {
  beforeEach(() => {
    nativo.handlers.clear();
    nativo.start.mockClear();
  });

  test("mientras dura la sesión, lo dictado se conserva —el envío lo lee DESPUÉS de soltar", async () => {
    // Es la razón de que no se pueda limpiar en el evento `end`: quien envía espera a `settled`,
    // y para entonces el texto tiene que seguir ahí.
    const { commits, dictar } = sonda();
    await dictar("Qué tal tu día hoy cómo te fue");

    expect(commits.at(-1)).toBe("Qué tal tu día hoy cómo te fue");
  });

  /**
   * ⭐⭐⭐ **EL DEFECTO REPORTADO, en su causa.** Los tramos se limpiaban en UN SOLO SITIO: al
   * ARRANCAR la sesión siguiente. Entre un dictado y el siguiente, lo dicho quedaba vivo en el hook
   * —invisible sólo porque el orbe estaba oculto—, y reaparecía plantado en pantalla al volver a
   * revelarlo. Un residuo que se esconde no está borrado: está esperando.
   */
  test("terminado el ciclo, `clear()` lo OLVIDA —no espera al siguiente dictado", async () => {
    const { commits, dictar, limpiar } = sonda();
    await dictar("Qué tal tu día hoy cómo te fue");

    limpiar();

    expect(commits.at(-1)).toBe("");
  });

  test("un parcial a medias tampoco sobrevive", async () => {
    const { commits, dictar, limpiar } = sonda();
    await dictar("hola");
    // El reconocedor deja un parcial abierto que nunca llegó a cerrarse en tramo.
    act(() => emitir("result", { results: [{ transcript: "y ademá" }], isFinal: false }));
    expect(commits.at(-1)).toContain("y ademá");

    limpiar();

    expect(commits.at(-1)).toBe("");
  });

  test("`clear()` sobre un dictado ya vacío no provoca un commit inútil", async () => {
    // Se llama en cada ocultado del orbe, también en los que nunca dictaron nada: si cada uno
    // costara un render, el reposo pagaría por un ciclo que no existió.
    const { commits, dictar, limpiar } = sonda();
    await dictar("hola");
    limpiar();
    const antes = commits.length;

    limpiar();

    expect(commits.length).toBe(antes);
  });
});
