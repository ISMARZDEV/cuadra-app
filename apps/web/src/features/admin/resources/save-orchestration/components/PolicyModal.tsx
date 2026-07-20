import type { ProviderFlowDto, UpdatePolicyRequest } from "@cuadra/api-client";
import { CalendarClock, Clock, Gauge, ListOrdered, Pencil, Timer } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterField } from "@/features/admin/components/filters/FilterField";
import { FilterModal } from "@/features/admin/components/filters/FilterModal";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import { updatePolicy } from "../api";

type T = (key: MessageKey) => string;
type Policy = ProviderFlowDto["policy"];

/**
 * Los TRES modos reales del dominio. El SDD decía dos (`manual | automatic`) — el código tiene tres,
 * porque el pipeline tiene tres mecanismos de disparo distintos:
 *
 * - `manual`           — solo lo lanza una persona.
 * - `automatic_chain`  — lo arrastra una `AutomationCondition`: **el orden lo da la DEPENDENCIA, no
 *                        el reloj**. Por eso NO lleva cron.
 * - `cron`             — el sensor DB-driven lo dispara por reloj, en la zona horaria de la policy.
 */
const MODES = ["manual", "automatic_chain", "cron"] as const;

/** Vacío → `null`, no `0`. No son lo mismo: `0` sería un límite de CERO queries, mientras que
 * "sin override" devuelve la precedencia al default global del mercado. */
function toNullableInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

// Modal de edición de política — mismo shell (`FilterModal` + `FilterField`) que Fuentes y la
// Canasta curada, para que el admin no termine con dos sistemas de formulario.
//
// El `PATCH` que consume ya existía desde F4 y no tenía consumidor en la UI: cambiar un cron exigía
// un `curl`. Esto es lo que cierra ese hueco.
export function PolicyModal({
  policy,
  onClose,
  refresh,
  t,
  locale,
}: {
  policy: Policy;
  onClose: () => void;
  refresh: () => Promise<void>;
  t: T;
  locale: Locale;
}) {
  const [mode, setMode] = useState<string>(policy.execution_mode);
  const [cron, setCron] = useState(policy.cron_expression ?? "");
  const [timezone, setTimezone] = useState(policy.timezone ?? "");
  const [sla, setSla] = useState(policy.sla_minutes?.toString() ?? "");
  const [queryLimit, setQueryLimit] = useState(policy.query_limit_override?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El cron SOLO existe en modo `cron`. Mostrarlo en `automatic_chain` sería una UI que promete algo
  // que el pipeline ignora — la invariante vive en la ENTIDAD del backend y acá se respeta.
  const isCron = mode === "cron";

  const apply = async () => {
    if (isCron && !cron.trim()) return setError(t("admin.orchestration.modal.errCronRequired"));

    setBusy(true);
    setError(null);
    const body: UpdatePolicyRequest = {
      execution_mode: mode as UpdatePolicyRequest["execution_mode"],
      // Fuera del modo cron el campo viaja en `null`: no peleamos con la validación de la entidad,
      // la acompañamos.
      cron_expression: isCron ? cron.trim() : null,
      timezone: timezone.trim() || null,
      sla_minutes: toNullableInt(sla),
      query_limit_override: toNullableInt(queryLimit),
      // `priority` NO viaja, a propósito. `PolicyDto` (lectura) no lo expone, así que el form no
      // puede conocer su valor actual: mandarlo siempre lo pisaría con `null`. El PATCH usa
      // `model_dump(exclude_unset=True)` — ausente es "no lo toques", que es justo lo que queremos.
      //
      // Tampoco se re-expone: nada en el dominio LEE `priority` (solo se persiste), y el §14 #17 ya
      // decidió que el orden real necesita `depends_on_flow` porque `priority` no alcanza. Un
      // control que guarda un número que nadie lee le promete al operador un efecto inexistente.
    };

    const res = await updatePolicy(policy.policy_id, body);
    setBusy(false);
    if ((res as { error?: unknown }).error) return setError(t("admin.orchestration.modal.errSave"));
    await refresh();
    onClose();
  };

  return (
    <FilterModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t("admin.orchestration.modal.title")}
      icon={<Pencil />}
      onClear={() => {
        setMode(policy.execution_mode);
        setCron(policy.cron_expression ?? "");
        setTimezone(policy.timezone ?? "");
        setSla(policy.sla_minutes?.toString() ?? "");
        setQueryLimit(policy.query_limit_override?.toString() ?? "");
        setError(null);
      }}
      onApply={() => void apply()}
      clearLabel={t("admin.orchestration.modal.reset")}
      applyLabel={busy ? t("admin.orchestration.modal.saving") : t("admin.orchestration.modal.save")}
      applyIcon={<Pencil className="size-4" />}
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <FilterField
        icon={<CalendarClock />}
        label={t("admin.orchestration.modal.fieldMode")}
        htmlFor="policy-mode"
      >
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger id="policy-mode" data-testid="policy-mode" className="h-11! w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {t(`admin.orchestration.mode.${m}` as MessageKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      {isCron ? (
        <FilterField
          icon={<Clock />}
          label={t("admin.orchestration.modal.fieldCron")}
          htmlFor="policy-cron"
        >
          <Input
            id="policy-cron"
            data-testid="policy-cron"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 6 * * *"
            className="h-11! rounded-xl font-mono"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{t("admin.orchestration.modal.hintCron")}</p>
        </FilterField>
      ) : null}

      <FilterField
        icon={<Timer />}
        label={t("admin.orchestration.modal.fieldTimezone")}
        htmlFor="policy-timezone"
      >
        <Input
          id="policy-timezone"
          data-testid="policy-timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/Santo_Domingo"
          className="h-11! w-full rounded-xl"
        />
      </FilterField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FilterField icon={<Gauge />} label={t("admin.orchestration.modal.fieldSla")} htmlFor="policy-sla">
          <Input
            id="policy-sla"
            data-testid="policy-sla"
            type="number"
            min={0}
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            className="h-11! w-full rounded-xl"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{t("admin.orchestration.modal.hintSla")}</p>
        </FilterField>

        <FilterField
          icon={<ListOrdered />}
          label={t("admin.orchestration.modal.fieldQueryLimit")}
          htmlFor="policy-query-limit"
        >
          <Input
            id="policy-query-limit"
            data-testid="policy-query-limit"
            type="number"
            min={0}
            value={queryLimit}
            onChange={(e) => setQueryLimit(e.target.value)}
            className="h-11! w-full rounded-xl"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("admin.orchestration.modal.hintQueryLimit")}
          </p>
        </FilterField>
      </div>

      {/* US-OR-L5: la UI declara qué política NO vive acá.
          Sin esto el operador no puede distinguir "esta palanca no existe" de "existe pero está en
          otro lado" — y termina buscando en la consola algo que sólo se cambia en el despliegue.
          Es el mismo criterio que el resto del módulo: declarar el límite en vez de callarlo. */}
      <div
        data-testid="policy-env-scope"
        className="rounded-2xl border border-dashed border-border p-3"
      >
        <p className="text-xs font-semibold text-foreground">
          {t("admin.orchestration.modal.envTitle")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("admin.orchestration.modal.envBody")}
        </p>
      </div>
    </FilterModal>
  );
}
