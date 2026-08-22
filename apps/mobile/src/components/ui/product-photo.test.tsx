import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProductPhoto, photoPlateStyle } from "./product-photo";

/**
 * La foto de un producto, con su placa.
 *
 * Nace de un defecto de reuso: la tarjeta del home ya tenía resuelto —y probado— que la placa es
 * BLANCA en los dos temas (las fotos son JPEG sin alfa sobre blanco puro, verificado contra el CDN
 * de VTEX) y que en oscuro se REDONDEA para que ese blanco se lea como decisión. El detalle de
 * producto se escribió sin reusar nada de eso: en oscuro salía un ladrillo blanco a sangre, y su
 * comentario afirmaba justo lo contrario («el catálogo llega con fondos recortados»).
 *
 * Dos partes de la app no pueden discrepar sobre el mismo hecho del catálogo.
 */
describe("la placa de la foto", () => {
  test("es BLANCA en los dos temas", () => {
    // No es un descuido heredado: es lo verificado contra el CDN. Cualquier otro color le dibuja
    // un recuadro alrededor a una foto que ya trae su propio fondo blanco.
    expect(photoPlateStyle("light").backgroundColor).toBe("#FFFFFF");
    expect(photoPlateStyle("dark").backgroundColor).toBe("#FFFFFF");
  });

  test("en oscuro se REDONDEA; en claro no le hace falta", () => {
    // El blanco es inevitable; que parezca deliberado no lo es. En claro se funde con la cáscara
    // clara y un radio no aporta nada; en oscuro es una placa contra el fondo y sí.
    expect(photoPlateStyle("light").borderRadius).toBe(0);
    expect(photoPlateStyle("dark").borderRadius).toBeGreaterThan(0);
  });

  test("el canto de la placa es CONTINUO, no un arco de círculo", () => {
    // El mismo canto que el resto de superficies de Save. A tamaño normal se ven casi iguales, y
    // por eso se comprueba aquí en vez de mirando una captura.
    expect(photoPlateStyle("dark").borderCurve).toBe("continuous");
  });
});

describe("la foto mientras carga", () => {
  test("sin URL no deja un hueco mudo, dice que NO HAY imagen", () => {
    // Un hueco vacío se lee como una imagen que no cargó —un error—, cuando lo cierto es que ese
    // producto no tiene foto en el catálogo. Son dos cosas distintas y el usuario las distingue.
    render(<ProductPhoto uri={null} />);
    // El arnés corre el i18n en INGLÉS.
    expect(screen.getByLabelText("No image")).toBeTruthy();
  });

  test("con URL pinta la imagen del catálogo", () => {
    render(<ProductPhoto uri="https://cdn.example/coco.jpg" />);
    expect(screen.getByRole("img")).toBeTruthy();
  });

  test("debajo de la foto hay un HUECO del tono del esqueleto", () => {
    // La foto viene del CDN del proveedor y tarda bastante más que el resto de la pantalla. Sin
    // este hueco, la placa entra en blanco y la foto cae encima segundos después: dos sucesos
    // donde debe haber uno. El tono es el mismo idioma de carga que el resto de Save.
    render(<ProductPhoto uri="https://cdn.example/coco.jpg" />);
    expect(screen.getByTestId("product-photo-pending")).toBeTruthy();
  });
});
