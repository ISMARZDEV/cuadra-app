import { ArrowLeft, Info } from "lucide-react";

import { MethodBadge } from "@/features/admin/components/MethodBadge";

import { QueuePager } from "./QueuePager";
import { ShortcutsBanner } from "./ShortcutsBanner";
import type { DetailHeaderProps } from "./interfaces";

// Encabezado del detalle: breadcrumb + pager de posición (fila superior) · título + subtítulo
// (confianza · método) + banner de atajos · banner informativo. El breadcrumb es un `<a>` real (link
// navegable, focus ring) — no un botón.
export function DetailHeader({
  confidence,
  method,
  locale,
  onApprove,
  onReject,
  onNext,
  onPrev,
  disabled,
  queue,
}: DetailHeaderProps) {
  const confidencePct = Math.round(confidence * 100);

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <a
          href="/admin/review-queue"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest/40 dark:text-brand-lime"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a cola de revisión
        </a>

        <QueuePager
          position={queue.position}
          total={queue.total}
          hasPrev={queue.hasPrev}
          hasNext={queue.hasNext}
          onPrev={onPrev}
          onNext={onNext}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revisar match</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {/* <span>{name ?? "(sin nombre)"}</span> */}
            <span>
              Confianza del match:{" "}
              <span className="font-semibold text-foreground tabular-nums">{confidencePct}%</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              Método: <MethodBadge method={method} locale={locale} />
            </span>
          </p>
        </div>

        <ShortcutsBanner
          onApprove={onApprove}
          onReject={onReject}
          onNext={onNext}
          onPrev={onPrev}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
        <Info className="size-4 shrink-0" aria-hidden="true" />
        <p>La confianza del match es baja o incierta, por eso necesita revisión humana.</p>
      </div>
    </header>
  );
}
