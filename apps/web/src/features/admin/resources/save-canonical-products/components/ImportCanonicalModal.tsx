import type { ImportCommitDto, ImportPreviewDto, ImportRowRequest } from "@cuadra/api-client";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, CheckCircle2, Upload, X, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui-base/button";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { commitCanonicalImport, previewCanonicalImport } from "../api";
import { parseCsv } from "../lib/parse-csv";

type Step = "paste" | "preview" | "done";

interface ImportCanonicalModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  t: (key: MessageKey) => string;
  locale: Locale;
}

// Import en TRES pasos (US-CP-L8): pegar → previsualizar → confirmar. El paso del medio existe
// para que el operador vea qué va a pasar ANTES de que pase: el preview no persiste nada, así que
// equivocarse ahí no cuesta un catálogo duplicado.
export function ImportCanonicalModal({
  open,
  onClose,
  onImported,
  t,
  locale,
}: ImportCanonicalModalProps) {
  const [step, setStep] = useState<Step>("paste");
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ImportRowRequest[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [result, setResult] = useState<ImportCommitDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setStep("paste");
    setRaw("");
    setRows([]);
    setUnknownHeaders([]);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const doPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const parsed = parseCsv(raw);
      setRows(parsed.rows);
      setUnknownHeaders(parsed.unknownHeaders);
      const res = await previewCanonicalImport({ rows: parsed.rows });
      if (!res) {
        setError(t("admin.canonicalProducts.import.error"));
        return;
      }
      setPreview(res);
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const doCommit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Se reenvían las filas CRUDAS, no las validadas: el commit re-valida del lado del servidor.
      // Confiar en un preview del cliente sería confiar en un estado que pudo quedar viejo.
      const res = await commitCanonicalImport({ rows });
      if (!res) {
        setError(t("admin.canonicalProducts.import.error"));
        return;
      }
      setResult(res);
      setStep("done");
      onImported();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                {t("admin.canonicalProducts.import.title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {t("admin.canonicalProducts.import.subtitle")}
              </Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" onClick={close} className="size-8">
              <X className="size-4" />
            </Button>
          </div>

          {/* Los tres pasos siempre visibles: el operador sabe dónde está y cuánto falta. */}
          <ol className="flex items-center gap-2 px-6 pt-4 text-xs font-semibold">
            {(
              [
                ["paste", "admin.canonicalProducts.import.step1"],
                ["preview", "admin.canonicalProducts.import.step2"],
                ["done", "admin.canonicalProducts.import.step3"],
              ] as const
            ).map(([key, label]) => (
              <li
                key={key}
                className={cn(
                  "rounded-full px-3 py-1",
                  step === key
                    ? "bg-brand-lime text-brand-forest"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {t(label)}
              </li>
            ))}
          </ol>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {error ? (
              <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {step === "paste" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t("admin.canonicalProducts.import.columns")}
                </p>
                <textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder={t("admin.canonicalProducts.import.placeholder")}
                  className="w-full rounded-2xl border border-border bg-background p-3 font-mono text-xs shadow-sm focus-visible:ring-2 focus-visible:ring-brand-lime focus-visible:outline-none"
                />
              </div>
            ) : null}

            {step === "preview" && preview ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Pill tone="ok">
                    <CheckCircle2 className="size-4" />
                    {format(locale, "admin.canonicalProducts.import.valid", {
                      count: String(preview.valid_count),
                    })}
                  </Pill>
                  {preview.invalid_count > 0 ? (
                    <Pill tone="error">
                      <XCircle className="size-4" />
                      {format(locale, "admin.canonicalProducts.import.invalid", {
                        count: String(preview.invalid_count),
                      })}
                    </Pill>
                  ) : null}
                  {preview.warnings.length > 0 ? (
                    <Pill tone="warn">
                      <AlertTriangle className="size-4" />
                      {format(locale, "admin.canonicalProducts.import.warnings", {
                        count: String(preview.warnings.length),
                      })}
                    </Pill>
                  ) : null}
                </div>

                {unknownHeaders.length > 0 ? (
                  <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    {unknownHeaders.join(", ")}
                  </p>
                ) : null}

                <IssueList issues={preview.invalid_rows} tone="error" locale={locale} />
                <IssueList issues={preview.warnings} tone="warn" locale={locale} />

                {preview.valid_count === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.canonicalProducts.import.noValidRows")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === "done" && result ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-5" />
                  {format(locale, "admin.canonicalProducts.import.done", {
                    count: String(result.imported_count),
                  })}
                </p>
                <IssueList issues={result.errors} tone="error" locale={locale} />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            {step === "preview" ? (
              <Button variant="outline" onClick={() => setStep("paste")} disabled={busy}>
                {t("admin.canonicalProducts.import.back")}
              </Button>
            ) : null}

            {step === "paste" ? (
              <button
                type="button"
                onClick={() => void doPreview()}
                disabled={busy || raw.trim() === ""}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90 disabled:opacity-50"
              >
                <Upload className="size-4" />
                {t("admin.canonicalProducts.import.preview")}
              </button>
            ) : null}

            {step === "preview" ? (
              <button
                type="button"
                onClick={() => void doCommit()}
                disabled={busy || (preview?.valid_count ?? 0) === 0}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-forest px-4 text-sm font-semibold text-brand-lime shadow-sm disabled:opacity-50"
              >
                {busy
                  ? t("admin.canonicalProducts.import.confirming")
                  : format(locale, "admin.canonicalProducts.import.confirm", {
                      count: String(preview?.valid_count ?? 0),
                    })}
              </button>
            ) : null}

            {step === "done" ? (
              <Button onClick={close}>{t("admin.canonicalProducts.import.close")}</Button>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    error: "bg-red-500/15 text-red-700 dark:text-red-300",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1", cls)}>
      {children}
    </span>
  );
}

function IssueList({
  issues,
  tone,
  locale,
}: {
  issues: { row_index: number; message: string; field?: string | null }[];
  tone: "warn" | "error";
  locale: Locale;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs">
      {issues.map((issue) => (
        <li
          key={`${tone}-${issue.row_index}-${issue.message}`}
          className={cn(
            "rounded-lg px-3 py-2",
            tone === "error"
              ? "bg-red-500/10 text-red-700 dark:text-red-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          <span className="font-semibold">
            {/* +1: el backend indexa desde 0, pero la fila 0 del archivo es el encabezado y el
                operador cuenta desde 1. Mostrar el índice crudo lo mandaría a la línea equivocada. */}
            {format(locale, "admin.canonicalProducts.import.row", {
              n: String(issue.row_index + 2),
            })}
          </span>{" "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
