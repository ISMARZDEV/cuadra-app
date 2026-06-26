# 🧩 SDD — Context: `identity`

> Planificación (spec → design → tasks) del bounded context **identity** (Identity & Access).
> Base: `arquitectura-mvp.md` §3, §10, §12·E E.2 · ADR 4 (capabilities aditivas), 31, 33.
> **Idiom Python** (no calco de .NET): SOLID + Repository + UoW(Session) + CQRS-light + DTOs Pydantic + DI(`Depends`).

---

## 1. Spec — qué + por qué

### Requisitos
- **R1** — Modelar identidad con **roles + capabilities ADITIVAS** (ADR 4): una identidad acumula roles; cada rol aporta capabilities.
- **R2** — `User` con `home_market` (identidad fiscal) y `current_market` (contexto actual) (§3·B).
- **R3** — Resolver **capabilities efectivas** = `f(roles, home_market, current_market)` — incluye el gating por jurisdicción (`capability_market`).
- **R4** — Endpoint **`GET /v1/me`**: devuelve el usuario + sus capabilities efectivas, autenticado por **JWT** (claims).
- **R5** — MVP: solo roles **Usuario Normal** + **Super Admin** activos (los demás = fases).
- **R6** — El **capability gating** es reutilizable por los otros contextos (un `Depends` que verifica una capability).

### Escenarios (Gherkin)
```
Escenario: capabilities efectivas filtradas por mercado
  Dado un User con rol "usuario_normal" y current_market = "RD"
  Cuando pide GET /v1/me
  Entonces recibe las capabilities del rol habilitadas en RD (capability_market.enabled = true)

Escenario: capability deshabilitada en el mercado
  Dada una capability deshabilitada en current_market
  Cuando se resuelven las efectivas
  Entonces esa capability NO aparece

Escenario: multi-rol acumula
  Dado un User con roles ["usuario_normal", "super_admin"]
  Cuando se resuelven
  Entonces obtiene la UNIÓN de capabilities de ambos roles

Escenario: gating reutilizable
  Dado un endpoint protegido por require_capability("x")
  Cuando el User no tiene "x" efectiva
  Entonces responde 403
```

### Fuera de alcance (MVP)
- Auth provider real (Supabase/Clerk) → **adapter con stub** (decodifica un JWT firmado localmente); la integración real es Fase 1.
- Billing: `user.plan` lo **sincroniza `platform/billing`** (ADR 25); identity solo lo lee.

---

## 2. Design — cómo (POO/SOLID/patrones, en Python)

### 2.1 Estructura
```
contexts/identity/
├── domain/                         # PURO (sin SQLAlchemy · ADR 31)
│   ├── entities.py                 # User · Role · Capability (dataclasses)
│   ├── value_objects.py            # Email · MarketId (encapsulan invariantes)
│   ├── enums.py                    # RoleKey · CapabilityKey (StrEnum)
│   ├── services.py                 # CapabilityResolver — lógica núcleo (pura)
│   └── ports.py                    # UserRepository · RoleRepository (Protocol)
├── application/
│   ├── dtos.py                     # MeResponse · UserDto (Pydantic)
│   ├── queries.py                  # GetMe (CQRS-read)
│   ├── commands.py                 # ProvisionUser (CQRS-write)
│   └── mappers.py                  # entity → DTO (explícito, no AutoMapper)
└── infrastructure/
    ├── models.py                   # SQLAlchemy (schema "identity") · ADR 33
    ├── repositories.py             # impl de los ports (UoW = Session)
    ├── mappers.py                  # model ↔ entity (explícito)
    └── auth.py                     # JWT decode → claims (adapter)
```

### 2.2 Patrones aplicados (idiom Python)
| Patrón / principio | Aplicación |
|---|---|
| **Repository** | `UserRepository` (`Protocol` en `domain/ports`) ← impl SQLAlchemy en `infrastructure` |
| **Unit of Work** | la **`Session` de SQLAlchemy** (commit/rollback por request); no se reimplementa |
| **CQRS-light** | `queries.py` (lectura, sin efectos) vs `commands.py` (escritura) — sin event sourcing |
| **Strategy** | gating por mercado = estrategia resuelta por `current_market` (alinea con `shared/market`) |
| **DTO** | Pydantic (`application/dtos.py`); **mapeo explícito** entity↔DTO y model↔entity |
| **DIP** | el dominio define `ports` (`Protocol`); `infrastructure` los implementa; `composition_root` cablea |
| **DI** | FastAPI `Depends` — `get_session` (scoped/por-request), `get_user_repo`, `get_current_user` |
| **SRP/OCP** | `CapabilityResolver` solo resuelve; añadir un rol nuevo = data, no código |

### 2.3 La pieza núcleo — `CapabilityResolver` (dominio puro, testeable sin DB)
```python
# domain/services.py  — sin I/O, sin SQLAlchemy: solo lógica
class CapabilityResolver:
    @staticmethod
    def resolve(
        roles: list[Role],
        market_gating: Mapping[CapabilityKey, bool],   # de capability_market(current_market)
    ) -> frozenset[CapabilityKey]:
        granted = {cap for role in roles for cap in role.capabilities}      # unión aditiva (ADR 4)
        return frozenset(c for c in granted if market_gating.get(c, True))  # gating por jurisdicción
```
> Es la lógica que el `IQueryable` no resuelve: se prueba **pura** (unit), sin tocar la DB.

### 2.4 Decisiones (idiom Python sobre tus conceptos)
- **Sync vs async:** identity es CRUD → **SQLAlchemy sync** (más simple; el scaffold ya es sync). El **agente (aispace) será async** (LLM = I/O). FastAPI maneja ambos.
- **IQueryable vs IEnumerable:** filtrar **en la query** (`select().where(...)`, traducido a SQL), **nunca** traer todo y filtrar en memoria con un comprehension.
- **AutoMapper → mapeo explícito:** `mappers.py` con funciones `model_to_entity` / `entity_to_dto`. Más líneas, pero el hexagonal lo pide (el dominio no conoce el ORM ni el DTO).
- **DI lifetimes:** `Session` = scoped (por request, vía `Depends`); `Settings` = singleton (módulo); repos = transient (factory en `Depends`).
- **Caché:** las capabilities efectivas cambian poco → cacheables por `(user_id, current_market)` con invalidación al cambiar roles (Fase 1, `fastapi-cache`+Redis). MVP: sin caché.
- **Encapsulación:** invariantes en value objects (`Email` valida en `__post_init__`); helpers `_privados`; `__all__` por módulo.

### 2.5 Datos (schema `identity` · ADR 33)
**7 tablas:** `user · auth_identity · role · capability · user_role · role_capability · capability_market`.
- **`auth_identity`** (`provider, subject, email?`) → login Google/Apple/password; clave = **`(provider, subject)`**,
  no el email (robusto ante Apple relay / multi-provider). **1 user → N** identidades (account linking).
- **`user.id` propio (UUID)** desacoplado del proveedor (provider-agnostic, como el `LLMPort`); el JWT (Supabase/Clerk)
  trae `(provider, subject)` y el adapter lo mapea a nuestro `user`. **Nunca se guarda password ni JWT** (§12.1).
- **Política de account-linking = Strategy** (en `application`): MVP = **B** (cuentas separadas + linking manual);
  **A** (auto-link por email) = cambiar la estrategia, **no** la tabla → "funciona de ambas maneras".
- `key` = PK natural en `role`/`capability`; `email` nullable; `market_id` por ID (no FK cross-context).

---

## 3. Tasks (checklist — cada una con criterio)

| # | Tarea | ✅ Criterio |
|---|---|---|
| **T1** | `domain/entities.py` + `value_objects.py` + `enums.py` (puros) | importan sin SQLAlchemy; `Email` inválido lanza |
| **T2** | `domain/services.py` — `CapabilityResolver` + **unit tests** | unión aditiva + gating por mercado verificados (pure) |
| **T3** | `domain/ports.py` — `Protocol` de repos | mypy/typecheck OK; sin impl |
| **T4** | `infrastructure/models.py` — SQLAlchemy, schema `identity` | `Base.metadata` incluye las **7 tablas** (con `auth_identity`) en schema `identity` |
| **T5** | **1ª migración Alembic** (`--autogenerate`) | `alembic upgrade head` crea schema `identity` + tablas en la DB |
| **T6** | `repositories.py` + `mappers.py` (model↔entity) | repo trae un User con sus roles (integration test con DB) |
| **T7** | `application/` — `GetMe` (query) + `dtos.py` + mapper entity→DTO | `GetMe(user_id)` devuelve `MeResponse` con capabilities efectivas |
| **T8** | `infrastructure/auth.py` — JWT decode → claims + `Depends(get_current_user)` | un JWT válido resuelve el `user_id`; inválido → 401 |
| **T9** | `api/v1/controllers/me.py` — `GET /v1/me` + CORS middleware | `GET /v1/me` con JWT → 200 + user + capabilities |
| **T10** | `composition_root` — cablea repos → services (DI) | el controller recibe el service ya cableado |
| **T11** | `require_capability(...)` dependency (gating reutilizable) | endpoint protegido → 403 si falta la capability |
| **T12** | seed: roles + capabilities MVP (Usuario Normal, Super Admin) | `python -m seeds` carga roles/capabilities idempotente |

> **Orden:** T1→T3 (dominio puro, sin DB) → T4→T6 (persistencia) → T7→T11 (aplicación+API) → T12 (seed). Cada bloque deja tests verdes antes de seguir.
