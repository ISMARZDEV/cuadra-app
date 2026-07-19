import type { SourceHealth } from "@cuadra/api-client";

import { Badge } from "@/components/ui/badge";
import type { MessageKey } from "@/i18n/messages";

// Badge de salud (3.19-web): sin auto-detección de rotura de esquema (SAGRADO, ver backend
// 3.18-3.19) — solo refleja lo que el backend ya calculó (pausa manual + frescura de
// `last_seen_at`). ok=verde, stale=ámbar, paused=gris. Colores Tailwind estándar directos (sin
// token semántico dedicado) porque son los únicos 3 usos de esta paleta en la app.
const HEALTH_KEY: Record<SourceHealth, MessageKey> = {
  ok: "admin.sources.health.ok",
  stale: "admin.sources.health.stale",
  paused: "admin.sources.health.paused",
};

const HEALTH_CLASS: Record<SourceHealth, string> = {
  ok: "border-green-200 bg-green-100 text-green-800",
  stale: "border-amber-200 bg-amber-100 text-amber-800",
  paused: "border-gray-200 bg-gray-100 text-gray-600",
};

export function HealthBadge({
  health,
  t,
}: {
  health: SourceHealth;
  t: (key: MessageKey) => string;
}) {
  return (
    <Badge variant="outline" className={HEALTH_CLASS[health]}>
      {t(HEALTH_KEY[health])}
    </Badge>
  );
}
