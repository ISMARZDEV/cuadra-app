"""Configuración de la app (pydantic-settings). Lee de entorno / .env."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Cuadra API"
    app_env: str = "dev"

    # DB — PostgreSQL único (ADR 31). Réplica de lectura opcional (§12·E E.5).
    database_url: str = "postgresql+psycopg://cuadra:cuadra@localhost:5433/cuadra"
    database_url_read: str = ""

    # LLM — proveedor intercambiable tras LLMPort (§7.8, shared/llm).
    # Claude = default de prod (ADRs); OpenAI u otro vía LLM_PROVIDER (p.ej. dev).
    llm_provider: str = "anthropic"   # "anthropic" | "openai"
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Observabilidad (ADR 28). LangSmith se auto-instrumenta por entorno: `langsmith_tracing`
    # activa el trazado y la key se exporta a os.environ en el arranque (ver src/observability.py).
    langsmith_api_key: str = ""
    langsmith_tracing: bool = False
    langsmith_project: str = "cuadra-api"
    sentry_dsn: str = ""

    # Auth (§12·E E.2) — el JWT lo emite/valida el proveedor; aquí solo la verificación de firma.
    # HS256 con secreto compartido = SOLO dev (dev-login). En prod el IdP (Clerk) firma RS256.
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"

    # Clerk (IdP real · §12·E E.2). `clerk_issuer` = Frontend API URL (claim `iss`); el JWKS se
    # deriva como `{issuer}/.well-known/jwks.json`. `clerk_authorized_parties` = orígenes
    # permitidos para el claim `azp` (anti-CSRF), coma-separado. Vacío = Clerk deshabilitado (dev).
    clerk_issuer: str = ""
    clerk_authorized_parties: str = ""

    @property
    def clerk_enabled(self) -> bool:
        return bool(self.clerk_issuer)

    @property
    def clerk_jwks_url(self) -> str:
        return f"{self.clerk_issuer.rstrip('/')}/.well-known/jwks.json"

    @property
    def clerk_authorized_party_list(self) -> list[str]:
        return [p.strip() for p in self.clerk_authorized_parties.split(",") if p.strip()]

    # Save · matching cascade (F2.0). Ship-dark: la cascada EAN→trgm→vector→judge→cola humana
    # solo se conecta al refresh cuando `save_matching_cascade_enabled=true` (por entorno, tras
    # bootstrapear la canasta curada). `save_bge_m3_endpoint_url` = endpoint HTTP del servidor de
    # embeddings BGE-M3 (HF TEI o wrapper); requerido si la cascada está activa.
    save_matching_cascade_enabled: bool = False
    save_bge_m3_endpoint_url: str = ""

    # Save · clasificación de categoría (save-category-classification). Ship-dark, igual que la
    # cascada de matching: el clasificador (léxico→trgm→vector→juez) solo se engancha a la ingesta
    # cuando `save_classification_enabled=true` (tras sembrar la taxonomía + embeddear categorías).
    # Reusa `save_bge_m3_endpoint_url` (mismo BGE-M3) y `llm_provider` (juez).
    save_classification_enabled: bool = False

    # Save · relevance gate (R2). Ship-dark: descarta EN DESCUBRIMIENTO el ruido fuera del scope del
    # catálogo (Magento hace OR de tokens → comida de perro por "arroz"). Reusa el lexicon de la
    # taxonomía y el footprint de categorías que ocupan los canónicos. Conservador: solo descarta
    # ante señal positiva de fuera-de-footprint. Requiere la taxonomía sembrada + canónicos clasificados.
    save_relevance_gate_enabled: bool = False

    # Save · el LLM en las corridas de ingesta (juez de matching + juez de categoría).
    #
    # OFF por decisión explícita (2026-07-15): la cuota está agotada y el juez se habilita a mano
    # cuando se decida pagarla. Con `false`, el LLM NO INTERVIENE en el flujo — no se construye el
    # juez, así que el circuit-breaker tampoco participa: no hay nada que pueda fallar ni degradar.
    #
    # La banda gris pasa a decidirla un HUMANO:
    #   · matcher    → revisión con method="human" (NO "llm": el juez no corrió, y decir lo contrario
    #                  mentiría — mirarías la cola creyendo que el LLM dudó de productos que no vio).
    #   · classifier → sin clasificar, method="none".
    #
    # La cascada DETERMINISTA queda intacta: EAN exacto (score 1.0), banda alta y léxico siguen
    # resolviendo gratis. Apagar el LLM no apaga el matching — apaga su tramo caro.
    #
    # Es el switch PREVENTIVO; el circuit-breaker (`llm_circuit_breaker.py`) es el REACTIVO, para
    # cuando el LLM está ON y se cae a mitad de batch. Se complementan, no se reemplazan.
    save_llm_judge_enabled: bool = False

    # CORS (§12·E E.1) — coma-separado (evita el parseo JSON de listas de pydantic-settings).
    # La web de Cuadra corre SIEMPRE en :3006 (dev). Prod se agrega vía CORS_ORIGINS en el entorno.
    cors_origins: str = "http://localhost:3006"

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # En dev el web corre SIEMPRE en :3006. Un `CORS_ORIGINS` fantasma exportado a mano en la
        # shell (la env var del OS le gana al `.env` en pydantic-settings) no debe poder tumbar el
        # preflight del web: garantizamos su origen pase lo que pase. Prod queda intacto.
        if self.app_env == "dev" and "http://localhost:3006" not in origins:
            origins.append("http://localhost:3006")
        return origins


settings = Settings()
