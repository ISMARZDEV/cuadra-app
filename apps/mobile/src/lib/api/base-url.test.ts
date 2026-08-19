import { describe, expect, test } from "vitest";

import { resolveApiBaseUrl } from "./base-url";

// El origen del problema: `EXPO_PUBLIC_*` se HORNEA en el bundle, y la IP LAN del Mac la cambia el
// DHCP. Una IP que era buena al arrancar Metro deja de serlo sin que nada avise, y el síntoma en
// pantalla es un «no pudimos cargar» que parece del código. La máquina que sirve el bundle es, por
// definición, alcanzable desde el dispositivo: es de donde acaba de llegar el JS.
describe("en desarrollo, el host sale de quien sirve el bundle", () => {
  test("usa el host de Metro y NO la IP horneada", () => {
    const url = resolveApiBaseUrl({
      configured: "http://10.0.0.113:8005", // la vieja, ya inservible
      metroHost: "10.0.0.89",
      isDev: true,
    });

    expect(url).toBe("http://10.0.0.89:8005");
  });

  // El puerto tampoco se hereda del `.env`, y esto costó una sesión: un `localhost:3000` mandó las
  // peticiones a un puerto vacío y el síntoma era idéntico al de la IP caducada. El puerto de la API
  // es un INVARIANTE del repo (8005), no una preferencia — heredarlo reproduce el mismo problema.
  test("ignora el puerto configurado y usa el del registro", () => {
    const url = resolveApiBaseUrl({
      configured: "http://localhost:3000",
      metroHost: "10.0.0.89",
      isDev: true,
    });

    expect(url).toBe("http://10.0.0.89:8005");
  });

  test("sin puerto configurado cae en el del registro fijo del repo", () => {
    const url = resolveApiBaseUrl({ configured: undefined, metroHost: "10.0.0.89", isDev: true });

    expect(url).toBe("http://10.0.0.89:8005");
  });

  // El simulador sí alcanza `localhost`, pero deducirlo igual no le quita nada y deja UNA sola
  // regla para simulador y device en vez de dos caminos que se comportan distinto.
  test("también reemplaza localhost", () => {
    const url = resolveApiBaseUrl({
      configured: "http://localhost:8005",
      metroHost: "10.0.0.89",
      isDev: true,
    });

    expect(url).toBe("http://10.0.0.89:8005");
  });
});

// La deducción es para APUNTAR A TU PROPIA MÁQUINA. Si alguien configuró una API remota a propósito
// —staging, un túnel, una demo— pisarla con el host de Metro le rompería el entorno en silencio.
describe("una API remota configurada a propósito se respeta", () => {
  test("no toca un host público", () => {
    const url = resolveApiBaseUrl({
      configured: "https://api.cuadra.do",
      metroHost: "10.0.0.89",
      isDev: true,
    });

    expect(url).toBe("https://api.cuadra.do");
  });

  test("no toca un túnel", () => {
    const url = resolveApiBaseUrl({
      configured: "https://algo.ngrok.io",
      metroHost: "10.0.0.89",
      isDev: true,
    });

    expect(url).toBe("https://algo.ngrok.io");
  });
});

describe("fuera de desarrollo manda lo configurado", () => {
  test("en producción NO deduce nada", () => {
    const url = resolveApiBaseUrl({
      configured: "https://api.cuadra.do",
      metroHost: "10.0.0.89",
      isDev: false,
    });

    expect(url).toBe("https://api.cuadra.do");
  });

  // Sin Metro (una build de release corriendo en el device) no hay nada que deducir.
  test("sin host de Metro se queda con lo configurado", () => {
    const url = resolveApiBaseUrl({
      configured: "http://10.0.0.113:8005",
      metroHost: null,
      isDev: true,
    });

    expect(url).toBe("http://10.0.0.113:8005");
  });

  test("sin nada de nada devuelve undefined en vez de una URL inventada", () => {
    expect(resolveApiBaseUrl({ configured: undefined, metroHost: null, isDev: true })).toBeUndefined();
  });
});

describe("reconoce las redes privadas", () => {
  test.each([
    "http://127.0.0.1:8005",
    "http://192.168.1.40:8005",
    "http://172.16.0.5:8005",
    "http://172.31.255.1:8005",
    "http://10.1.2.3:8005",
  ])("%s es local y se reemplaza", (configured) => {
    expect(resolveApiBaseUrl({ configured, metroHost: "10.0.0.89", isDev: true })).toBe(
      "http://10.0.0.89:8005",
    );
  });

  // 172.32 queda FUERA del rango privado (que va del 16 al 31). Si esto se reemplazara, la regla
  // estaría mal escrita.
  test("172.32 NO es privada", () => {
    const configured = "http://172.32.0.1:8005";

    expect(resolveApiBaseUrl({ configured, metroHost: "10.0.0.89", isDev: true })).toBe(configured);
  });
});
