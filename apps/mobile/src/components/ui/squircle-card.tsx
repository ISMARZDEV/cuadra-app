import { cssInterop } from "nativewind";
import type { ComponentProps } from "react";
import SquircleView from "react-native-fast-squircle";

/**
 * El SUAVIZADO de esquina de toda la app, en un solo sitio.
 *
 * ⭐⭐ 1 = el máximo, y es MÁS marcado que el de Apple a propósito. `borderCurve: "continuous"` —el
 * `RoundedCornerStyle.continuous` de iOS— da el 60% que Figma documenta como su preset de iOS, y a
 * los radios que usa esta app la diferencia contra una esquina circular son un par de puntos: se
 * SIENTE, no se ve. El diseño de Cuadra la quiere visible.
 */
export const CORNER_SMOOTHING = 1;

// ⭐ Le enseña a NativeWind a traducir `className` en `style` para esta vista nativa. Sin esto,
// media migración —las tarjetas escritas con `rounded-2xl` y utilidades de Tailwind— habría tenido
// que reescribirse a estilos en línea sólo para cambiar la forma de una esquina.
cssInterop(SquircleView, { className: "style" });

type SquircleCardProps = ComponentProps<typeof SquircleView> & { className?: string };

/**
 * Una superficie con la esquina de Cuadra: redondeada y con el suavizado al máximo.
 *
 * ⭐⭐ **Existe para que el número viva en UN sitio.** Se podría usar `SquircleView` directamente,
 * pero entonces cada tarjeta tendría que repetir `cornerSmoothing={1}` — y bastaría con olvidarlo en
 * una para tener dos lenguajes de esquina en la misma pantalla, que es justo lo que nadie sabe
 * explicar pero todo el mundo nota. Aquí el valor por defecto ya es el de la marca.
 *
 * ⭐ **La regla no es el tamaño del radio, es la FORMA.** Sustituye a un `<View>` en cualquier
 * superficie con esquina —tarjetas y botones, de radio 8 para arriba— pero **NUNCA en círculos ni
 * en píldoras** (`borderRadius: alto / 2`): ahí no hay lado recto contra el que suavizar la curva,
 * así que el suavizado no significa nada y la forma resultante es incorrecta. Los sellos y
 * separadores de radio 2-6 tampoco: el efecto es imperceptible y sólo añaden una vista nativa.
 *
 * (La primera versión de esta regla decía «de 12pt para arriba». Era una inferencia mía, y los
 * botones de `store-actions` —radio 8— la desmintieron: ahí el suavizado sí se lee.)
 *
 * ⭐ Un `Pressable` NO puede ser la vista nativa del squircle. El patrón para botones y filas
 * pulsables es: `SquircleCard` FUERA con el radio, el `overflow` y el tinte; `Pressable` DENTRO con
 * el toque y el relleno. El `overflow` tiene que quedarse arriba o el contenido se recorta contra
 * una esquina circular y el canto delata las dos formas.
 *
 * ⚠️ Es una vista NATIVA (Fabric). Si aparece «Unimplemented component: <FastSquircleView>», el
 * arreglo es `scripts/check-native-build.sh` + `expo prebuild` + rebuild — no tocar código.
 */
export function SquircleCard({ cornerSmoothing = CORNER_SMOOTHING, ...rest }: SquircleCardProps) {
  return <SquircleView cornerSmoothing={cornerSmoothing} {...rest} />;
}
