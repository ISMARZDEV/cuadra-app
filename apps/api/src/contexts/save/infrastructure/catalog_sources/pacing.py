"""Espera entre requests a una tienda (rate limiting de salida). Infra: hace I/O real (duerme).

Es la otra mitad del patrón de SupermercadosRD (`scrape-many.ts:31-32,66-68`), la que nos faltaba:

    const delayMinMs = options.delayMinMs ?? 600;
    const delayMaxMs = options.delayMaxMs ?? 1200;
    ...
    await randomDelay(delayMinMs, delayMaxMs);   // ENTRE rondas

`round_robin_by_store` (dominio) copió el INTERCALADO de ese archivo y su docstring dice que evita
rate-limits — pero el intercalado solo reparte la carga si hay VARIAS tiendas. Con una sola es un
no-op: devuelve la misma lista y los N requests salen a fondo. `price_refresh` sobre Bravo es
exactamente ese caso (una tienda, cientos de `/get`). Comprobado en vivo 2026-07-15: Bravo responde
**429**. El rate limiting de SRD nunca estuvo en el orden — estaba en la pausa.

El JITTER (rango, no valor fijo) evita que N procesos sincronizados peguen en la misma milésima:
con una pausa fija, dos corridas simultáneas se alinean y el pico es el mismo que sin pausa.
"""
from __future__ import annotations

import random
import time
from collections.abc import Callable

# Mismos valores por defecto que SRD (`scrape-many.ts:31-32`): ~1 request/s por tienda, que es el
# ritmo que sus scrapers sostienen en producción contra estas mismas APIs.
_DEFAULT_MIN_MS = 600
_DEFAULT_MAX_MS = 1200


def build_pace(
    min_ms: int = _DEFAULT_MIN_MS,
    max_ms: int = _DEFAULT_MAX_MS,
    *,
    sleep: Callable[[float], None] | None = None,
) -> Callable[[], None]:
    """Espera un rato al azar en `[min_ms, max_ms]`. `sleep` se inyecta para testear sin dormir.

    `sleep=None` resuelve `time.sleep` en cada llamada, NO al definir el módulo. Con un default
    `sleep=time.sleep` la referencia queda congelada al importar y un `monkeypatch` de `time.sleep`
    no tiene efecto — o sea, un test que crea el pace antes de parchear dormiría de verdad, en
    silencio. Resolverlo tarde mantiene el módulo parcheable.
    """
    if min_ms < 0 or max_ms < min_ms:
        raise ValueError(f"rango de pacing inválido: [{min_ms}, {max_ms}]")

    def pace() -> None:
        (sleep or time.sleep)(random.uniform(min_ms, max_ms) / 1000.0)

    return pace
