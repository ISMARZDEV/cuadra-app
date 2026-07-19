import { Badge } from "@/components/ui/badge";
import type { MessageKey } from "@/i18n/messages";

// Estado de la última corrida SEGÚN EL RUNNER. `null` NO se pinta como "ok" ni como "falló": es
// `sin corridas` — el operador tiene que poder distinguir "nunca corrió" de "corrió y salió bien",
// que es exactamente la confusión que un badge por defecto produciría.
const STATE_KEY: Record<string, MessageKey> = {
  queued: "admin.orchestration.state.queued",
  running: "admin.orchestration.state.running",
  canceling: "admin.orchestration.state.canceling",
  succeeded: "admin.orchestration.state.succeeded",
  failed: "admin.orchestration.state.failed",
  canceled: "admin.orchestration.state.canceled",
  unknown: "admin.orchestration.state.unknown",
};

// Mismas 3 familias de color que `HealthBadge` (verde ok / ámbar atención / gris inactivo), + rojo
// para el fallo. `unknown` va en gris a propósito: no sabemos qué pasó, y pintarlo de verde o rojo
// sería afirmar algo.
const STATE_CLASS: Record<string, string> = {
  queued: "border-sky-200 bg-sky-100 text-sky-800",
  running: "border-sky-200 bg-sky-100 text-sky-800",
  canceling: "border-amber-200 bg-amber-100 text-amber-800",
  succeeded: "border-green-200 bg-green-100 text-green-800",
  failed: "border-red-200 bg-red-100 text-red-800",
  canceled: "border-gray-200 bg-gray-100 text-gray-600",
  unknown: "border-gray-200 bg-gray-100 text-gray-600",
};

export function FlowStatusBadge({
  state,
  t,
}: {
  state: string | null | undefined;
  t: (key: MessageKey) => string;
}) {
  if (!state) {
    return (
      <Badge variant="outline" className="border-dashed border-gray-300 text-gray-500">
        {t("admin.orchestration.state.never")}
      </Badge>
    );
  }
  const key = STATE_KEY[state] ?? "admin.orchestration.state.unknown";
  const cls = STATE_CLASS[state] ?? STATE_CLASS.unknown;
  return (
    <Badge variant="outline" className={cls}>
      {t(key)}
    </Badge>
  );
}
