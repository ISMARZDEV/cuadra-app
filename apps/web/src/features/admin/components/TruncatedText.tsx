import { useEffect, useRef, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui-base/tooltip";
import { cn } from "@/lib/utils";

/**
 * Texto acotado a N líneas que revela el resto en un tooltip **solo si de verdad no entra**.
 *
 * La condición importa: un tooltip que repite un texto ya visible obliga a un gesto para no revelar
 * nada, y entrena al operador a ignorarlos. Por eso no se pone siempre — se MIDE.
 *
 * Se mide con `scrollHeight > clientHeight` (que es cómo se detecta un `line-clamp`) y se re-mide
 * con `ResizeObserver`, no con `window.resize`: en el admin el sidebar se COLAPSA, así que la
 * columna cambia de ancho sin que la ventana cambie de tamaño.
 *
 * Vive en `admin/components` y no dentro de Orquestación porque Canónicos y Productos traen
 * descripciones igual de largas — construirlo local sería duplicarlo tres veces (mismo criterio que
 * `ConfirmDialog`).
 */
export function TruncatedText({
  text,
  lines = 2,
  className,
}: {
  text: string | null | undefined;
  lines?: 1 | 2 | 3;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // +1 de tolerancia: los navegadores redondean la altura de línea y un empate exacto marcaría
    // truncado un texto que entra justo.
    const measure = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, lines]);

  if (!text) return null;

  const clamp = lines === 1 ? "line-clamp-1" : lines === 3 ? "line-clamp-3" : "line-clamp-2";

  // El árbol NO cambia de forma cuando `truncated` cambia: el trigger y el <span> medido están
  // SIEMPRE montados y solo el CONTENIDO del tooltip es condicional.
  //
  // Antes se devolvía el <span> pelado cuando no estaba truncado y se lo envolvía en el trigger
  // cuando sí: eso RE-PARENTA el nodo medido, React monta uno nuevo, `ref.current` cambia y el
  // efecto (deps `[text, lines]`) NO vuelve a correr → el `ResizeObserver` quedaba observando el
  // nodo viejo, ya desprendido. La medición moría tras el primer cambio y la promesa de re-medir al
  // colapsar el sidebar no se cumplía nunca.
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          data-testid="truncated-text"
          data-truncated={truncated}
          // `render` evita meter un botón: cambiaría el layout justo en el elemento cuya altura
          // estamos midiendo. Sin truncar, el cursor no insinúa que haya algo más que ver.
          render={<span className={truncated ? "block cursor-help" : "block"} />}
        >
          {/* `whitespace-normal` es OBLIGATORIO, no cosmético: el `TableCell` base trae
              `whitespace-nowrap` y se hereda. Sin esto el texto NUNCA envuelve → queda en una línea
              → `line-clamp` no tiene qué recortar (no aparece el `…`) y
              `scrollHeight === clientHeight`, así que el tooltip tampoco dispara. UN estilo
              heredado rompía las tres cosas a la vez. Vive acá y no en quien lo llame: es un
              componente COMPARTIDO y quien lo use en una tabla no tiene por qué saberlo. */}
          <span ref={ref} className={cn(clamp, "whitespace-normal break-words", className)}>
            {text}
          </span>
        </TooltipTrigger>
        {/* Solo existe si de verdad hay algo oculto: un tooltip que repite un texto ya visible
            obliga a un gesto para no revelar nada y entrena a ignorarlos todos. */}
        {truncated ? (
          <TooltipContent className="max-w-sm leading-relaxed">{text}</TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}
