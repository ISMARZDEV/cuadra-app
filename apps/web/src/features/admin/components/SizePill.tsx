import { cn } from "@/lib/utils";

// Las dos píldoras de tamaño del OFV (Figma 483:12422). Viven acá y NO en una resource porque
// las comparten la Cola de revisión y el catálogo canónico: el operador salta entre las dos
// tablas todo el día y un mismo dato tiene que verse igual en ambas.
//
// `amount` es el número (teal RELLENO) y `unit` la unidad (lima). El contraste entre las dos
// es lo que deja leer "330 · Ml" de un golpe de vista sin encabezado de por medio.
//
// Valores MEDIDOS del render, no declarados: amount = bg #007e62 / texto #c2fb7e;
// unit = bg `--brand-lime` (#A7E842) / texto #3f6942. Ambas píldoras son de relleno sólido, así
// que no cambian entre claro y oscuro — verificado en los dos temas.
const TONE_CLASS = {
  amount: "bg-[#007e62] text-[#c2fb7e]",
  unit: "bg-brand-lime text-[#3f6942]",
} as const;

interface SizePillProps {
  value: string | null | undefined;
  tone: keyof typeof TONE_CLASS;
}

export function SizePill({ value, tone }: SizePillProps) {
  // Sin dato NO se pinta la píldora: una píldora vacía leería como "hay un valor" cuando no lo hay.
  if (!value) return <span className="text-muted-foreground">—</span>;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold",
        TONE_CLASS[tone],
      )}
    >
      {value}
    </span>
  );
}
