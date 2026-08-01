import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { MessageKey } from "@/i18n/messages";

interface CanonicalPagerProps {
  /** Posición 1-based dentro del listado filtrado; `null` si el producto no califica. */
  position: number | null;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Salta a una posición 1-based arbitraria del listado filtrado. */
  onJumpToPosition?: (position: number) => void;
  disabled?: boolean;
  t: (key: MessageKey) => string;
}

// Pager del detalle de canónicos: navega al anterior/siguiente producto del listado filtrado.
// Diseño acorde a la consola admin: pill redondeado, botones circulares, contador "pos / total".
export function CanonicalPager({
  position,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onJumpToPosition,
  disabled,
  t,
}: CanonicalPagerProps) {
  const [draft, setDraft] = useState(String(position ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const editable = position !== null && total > 0 && onJumpToPosition !== undefined;

  // Cuando cambia la posición real (navegación exitosa), sincronizar el borrador.
  useEffect(() => {
    setDraft(String(position ?? ""));
  }, [position]);

  const submit = () => {
    if (!editable) return;
    const value = draft.trim();
    if (value === "" || !/^\d+$/.test(value)) {
      setDraft(String(position));
      return;
    }
    const next = parseInt(value, 10);
    if (Number.isNaN(next) || next < 1 || next > total) {
      setDraft(String(position));
      return;
    }
    if (next !== position) {
      onJumpToPosition(next);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
      inputRef.current?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(String(position ?? ""));
    }
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-black/5 bg-card p-1 shadow-sm",
        "dark:border-white/10",
      )}
      aria-label={t("admin.canonicalDetail.pager.label")}
    >
      <button
        type="button"
        aria-label={t("admin.canonicalDetail.pager.prev")}
        disabled={disabled || !hasPrev}
        onClick={onPrev}
        className={cn(
          "flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors",
          "outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-forest/40",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <span
        className="inline-flex min-w-[3.5rem] items-center justify-center gap-1 px-2 text-center text-sm tabular-nums text-foreground"
        aria-live="polite"
      >
        {editable ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={t("admin.canonicalDetail.pager.position")}
            title={t("admin.canonicalDetail.pager.positionHint")}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={submit}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              "h-6 w-8 rounded border border-transparent bg-transparent py-0.5 text-center text-sm font-semibold",
              "focus:border-brand-forest/30 focus:bg-muted focus:outline-none",
              "disabled:opacity-50",
            )}
          />
        ) : (
          <span className="text-sm font-semibold">{position ?? "—"}</span>
        )}{" "}
        <span className="font-normal text-muted-foreground">/ {total}</span>
      </span>
      <button
        type="button"
        aria-label={t("admin.canonicalDetail.pager.next")}
        disabled={disabled || !hasNext}
        onClick={onNext}
        className={cn(
          "flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors",
          "outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-forest/40",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
